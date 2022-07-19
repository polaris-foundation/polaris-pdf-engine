import express = require('express');
import PDFDocument = PDFKit.PDFDocument;
import { PatientModel } from './models/patient';
import { log } from './log';
import { ChartModel, PageModel } from './models/chart';
import { ChartColumns, ColumnInfo } from './models/chartColumns';
import { ChartSection } from './models/chartSection';
import {
  BasePage,
  ChartPage,
  Field,
  Grid,
  HtmlField,
  LayoutConfig,
  MessageText,
  PageName,
  Section,
  SvgField,
  TableCell,
  TableField,
  TextField
} from './models/layoutTypes';

import {
  isSpecialValue,
  MISSING,
  NO_READINGS_FOR_24_HOURS,
  REFUSED,
  SCORE_SYSTEM_CHANGE,
  SpecialValue
} from './util/symbols';
import { ObservationSetBase } from './models/observations';
import {
  JsonRequest,
  NurseConcern,
  ObservationJson,
  ObservationMetadataJson,
  ObservationPair,
  ObservationReading,
  SendConfig
} from './models/jsonTypes';
import { validate } from './models/layoutTypes.validator';

const fs = require('fs');
const { promisify } = require('util');
const path = require('path');
const cheerio = require('cheerio');

const PDFDoc = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');

const readFile = promisify(fs.readFile);
const readFileSync = fs.readFileSync;
const readdir = promisify(fs.readdir);

const CUSTOMER_CODE = process.env.CUSTOMER_CODE || 'DEV';

const PAGE_DEFAULTS = {
  size: 'A4',
  margins: { top: 10, bottom: 0, left: 10, right: 10 },
  translate: [0, 0]
};

interface FontMapping {
  fontpath: string;
  normal: string;
  bold: string;
  italic: string;

  [K: string]: string;
}

interface DisplayMapping {
  [display: string]: { displayName: string; value: number };
}

type TextSegment = [string, string, boolean]; // 3-tuples for HTML text(continued is true for all but the last text in a paragraph)

const FONT_DEFAULTS: FontMapping = {
  fontpath: 'src/fonts/',
  normal: 'SourceSansPro-Regular',
  bold: 'SourceSansPro-Bold',
  italic: 'SourceSansPro-It'
};

const GRID_DEFAULTS = { left: 0, top: 0, width: null, height: null, space: 50 };
const MESSAGE_DEFAULTS = { bgColour: '#ffffff' };
const SECTION_DEFAULTS: Section = {
  bottom: 0,
  candle: undefined,
  font: '',
  high: 0,
  low: 0,
  messageBottom: undefined,
  messageTop: undefined,
  name: '',
  range: [],
  rows: 0,
  type: 'simple',
  fontSize: 8,
  height: 10.1,
  colour: '#000000',
  box: false,
  display: null,
  bgColours: null,
  border: null,
  borderWidth: 0.5
};
const POINT_OFFSET = 3;

function htmlToTextSegments(fonts: FontMapping, html: string): TextSegment[][] {
  let paras: TextSegment[][] = []; // List of arrays from output.
  let output: TextSegment[] = [];
  let skippingSpace = true; // After a block tag we ignore leading whitespace.
  const $: CheerioStatic = cheerio.load(html);

  const flushBuffer = (): void => {
    if (output.length === 0) {
      output.push(['', fonts.normal, false]);
    } else {
      output[output.length - 1][2] = false;
    }
    paras.push(output);
    output = [];
    skippingSpace = true;
  };

  const pushText = (text: string, font: string): void => {
    if (skippingSpace) {
      text = text.replace(/^\s+/, '');
    }
    if (text) {
      output.push([text, font, true]);
      skippingSpace = false;
    }
  };

  const queueNode = (
    node: CheerioElement,
    currentFont = fonts.normal
  ): void => {
    if (node.type === 'text' && node.data !== undefined) {
      pushText(node.data, currentFont);
    } else if (node.type === 'tag') {
      switch (node.tagName) {
        case 'br':
          flushBuffer();
          break;

        case 'b':
        case 'strong':
          $(node)
            .contents()
            .each((_, node) => queueNode(node, fonts.bold));
          break;

        case 'i':
        case 'em':
          $(node)
            .contents()
            .each((_, node) => queueNode(node, fonts.italic));
          break;

        case 'ul':
        case 'li':
          flushBuffer();
          $(node)
            .contents()
            .each((_, node) => queueNode(node, currentFont));
          flushBuffer();
          break;

        case 'p':
          $(node)
            .contents()
            .each((_, node) => {
              queueNode(node);
              flushBuffer();
            });
          break;

        default:
          log.info('unhandled tag <' + node.tagName + '>');
          break;
      }
    }
  };

  // Iterate over the tags and text at the top level of the document
  $('body')
    .contents()
    .each((index, node) => {
      queueNode(node);
    });
  flushBuffer();
  return paras;
}

function tableCellDimensions(
  field: TableField,
  col: number,
  row: number
): { left: number; top: number; width: number; height: number } {
  const left =
    (col === 0 ? field.cellpadding : field.columns[col - 1]) +
    field.cellpadding;
  const right =
    col >= field.columns.length
      ? field.width - field.cellpadding
      : field.columns[col];
  const width = right - left - field.cellpadding;

  const rows = field.rows;

  const top = (row === 0 ? 0 : rows[row - 1]) + field.cellpadding;
  const bottom =
    row >= rows.length ? field.height - field.cellpadding : rows[row];

  const height = bottom - top - 2 * field.cellpadding;
  return { left, top, width, height };
}

function unreachableCode(value: never): never {
  log.error(`Unexpected value ${value}`);
  throw new Error(`Unexpected value ${value}`);
}

function assertObservationPair(value: unknown): value is ObservationPair {
  const obs: ObservationPair = value as ObservationPair;
  if (obs.high !== undefined && obs.low !== undefined) {
    return true;
  }
  throw new Error('Expected observation pair');
}
function assertObservationJson(value: unknown): value is ObservationJson {
  if ((value as ObservationJson).observation_type !== undefined) {
    return true;
  }
  throw new Error('Expected observation');
}

function assertObservationReading(value: unknown): value is ObservationReading {
  if (
    typeof value == 'number' ||
    typeof value == 'string' ||
    (value as ObservationJson).observation_type !== undefined
  ) {
    return true;
  }
  throw new Error('Expected observation, string or number');
}

class Generator {
  private readonly layout: LayoutConfig;
  private readonly translate: [number, number];
  private readonly doc: PDFDocument;
  private newPage: boolean = true;
  private readonly chart: ChartModel;
  private newsColumns: ChartColumns;
  private meowsColumns: ChartColumns;
  private readonly patient: PatientModel;
  private readonly obsPages: PageModel[];
  private readonly messages: {
    [REFUSED]: MessageText;
    [SCORE_SYSTEM_CHANGE]: MessageText;
    [MISSING]: MessageText;
    [NO_READINGS_FOR_24_HOURS]: MessageText;
  };
  private readonly fonts: FontMapping;
  private readonly newsSections: ChartSection[];
  private readonly meowsSections: ChartSection[];
  private fontMapping: { [K: string]: string } = {};
  private news2FullMessageTop: number = 0;
  private meowsFullMessageTop: number = 0;
  private news2SpecialColumnSections: ChartSection[] = [];
  private meowsSpecialColumnSections: ChartSection[] = [];
  private currentPage = 0;
  private firstPage = 1;
  private lastPage = 999999;

  constructor(layout: LayoutConfig, chart: ChartModel) {
    this.layout = layout;
    const { size, margins, translate } = { ...PAGE_DEFAULTS, ...layout.page };
    this.translate = translate;

    this.doc = new PDFDoc({ size, margins });
    this.chart = chart;
    this.newsColumns = new ChartColumns(layout.news2);
    this.meowsColumns = new ChartColumns(layout.meows);
    this.patient = chart.patient;
    this.obsPages = chart.pages;

    const messages = this.layout.news2.messages;
    this.messages = {
      [REFUSED]: messages.refused,
      [SCORE_SYSTEM_CHANGE]: messages.score_system_change,
      [MISSING]: messages.missing,
      [NO_READINGS_FOR_24_HOURS]: messages.no_obs
    };

    this.fonts = { ...FONT_DEFAULTS, ...layout.fonts };
    this.newsSections = [];
    this.meowsSections = [];

    let sectionDefaults: Section = {
      ...SECTION_DEFAULTS,
      font: this.fonts.normal
    };
    for (let sectionInfo of this.layout.news2.sections) {
      const combinedSection = { ...sectionDefaults, ...sectionInfo };
      if (sectionInfo.name !== undefined) {
        const chartSection = new ChartSection(
          combinedSection,
          this.newsColumns.columnInfo[0].row_height
        );
        this.newsSections.push(chartSection);
      } else {
        // No name means we update the defaults
        sectionDefaults = combinedSection;
      }
    }
    
    for (let sectionInfo of this.layout.meows.sections) {
      const combinedSection = { ...sectionDefaults, ...sectionInfo };
      if (sectionInfo.name !== undefined) {
        const chartSection = new ChartSection(
          combinedSection,
          this.meowsColumns.columnInfo[0].row_height
        );
        this.meowsSections.push(chartSection);
      } else {
        // No name means we update the defaults
        sectionDefaults = combinedSection;
      }
    }
    this.news2FixupMessageSections();
    this.meowsFixupMessageSections();
  }

  async setupFonts(): Promise<void> {
    for (let fontFile of await readdir(this.fonts.fontpath)) {
      if (!fontFile.endsWith('.otf')) {
        continue;
      }

      const fullPath = path.join(this.fonts.fontpath, fontFile);
      const fontName = path.basename(fontFile, '.otf');

      log.debug(`Load font ${fontName} ${fullPath}`);
      this.fontMapping[fontName.toLowerCase()] = fontName;
      this.doc.registerFont(fontName, fullPath);
    }
    const aliases = this.layout.font_aliases;
    if (aliases) {
      for (let alias in aliases) {
        if (aliases.hasOwnProperty(alias)) {
          this.fontMapping[alias.toLowerCase()] = aliases[alias];
        }
      }
    }
  }

  news2FixupMessageSections(): void {
    // Some messages display across more than one section. For each group fix all message top/bottom
    // values to be the same across the group.
    const namedSections: {
      [name: string]: ChartSection;
    } = this.newsSections.reduce(
      (map, section) =>
        section.name ? { [section.name]: section, ...map } : map,
      {}
    );

    for (let group of this.layout.news2.message_groups) {
      const top = Math.min(
        ...group.map(name => namedSections[name].messageTop)
      );
      const bottom = Math.max(
        ...group.map(name => namedSections[name].messageBottom)
      );
      group.map(name => {
        namedSections[name].messageTop = top;
      });
      group.map(name => {
        namedSections[name].messageBottom = bottom;
      });
    }
    // Dummy section 'topSection' type='blank' doesn't display but lets us position the top of full column messages.
    this.news2FullMessageTop = namedSections.topSection.top;

    // Want date and time for full-height messages
    this.news2SpecialColumnSections = this.newsSections.filter(
      section =>
        section.name == 'date' ||
        section.name == 'time' ||
        section.name == 'initials'
    );
  }

  meowsFixupMessageSections(): void {
    // Some messages display across more than one section. For each group fix all message top/bottom
    // values to be the same across the group.
    const namedSections: {
      [name: string]: ChartSection;
    } = this.meowsSections.reduce(
      (map, section) =>
        section.name ? { [section.name]: section, ...map } : map,
      {}
    );

    for (let group of this.layout.meows.message_groups) {
      const top = Math.min(
        ...group.map(name => namedSections[name].messageTop)
      );
      const bottom = Math.max(
        ...group.map(name => namedSections[name].messageBottom)
      );
      group.map(name => {
        namedSections[name].messageTop = top;
      });
      group.map(name => {
        namedSections[name].messageBottom = bottom;
      });
    }
    // Dummy section 'topSection' type='blank' doesn't display but lets us position the top of full column messages.
    this.meowsFullMessageTop = namedSections.topSection.top;

    // Want date and time for full-height messages
    this.meowsSpecialColumnSections = this.meowsSections.filter(
      section =>
        section.name == 'date' ||
        section.name == 'time' ||
        section.name == 'initials'
    );
  }

  isPageInRange(): boolean {
    return (
      this.currentPage >= this.firstPage && this.currentPage <= this.lastPage
    );
  }

  nextPage(): void {
    this.currentPage += 1;
  }

  async createDocument(
    response: express.Response,
    first: number,
    last: number
  ): Promise<void> {
    this.currentPage = 1;
    this.firstPage = first;
    this.lastPage = last;

    // Make current page number accessible as a field.
    this.patient.pageNumberCallback = (): number => this.currentPage;

    await this.createFrontPages();
    await this.createObsPages();
    
    this.doc.pipe(response);
    this.doc.end();
  }

  async createFrontPages(): Promise<void> {
    return this.createPagesWithoutObs(this.layout.pages_front);
  }

  async createBackPages(score_system: string): Promise<void> {
    if (score_system == 'meows') {
      return this.createPagesWithoutObs(this.layout.pages_back_meows);
    } else {
      return this.createPagesWithoutObs(this.layout.pages_back_news2);
    }

  }

  async createPagesWithoutObs(pages: PageName[]): Promise<void> {
    for (let name of pages) {
      await this.addBasicPage(name);
      this.nextPage();
    }
  }

  async createObsPages(): Promise<void> {
    let firstObsPage = this.currentPage;
    let lastScore = 'news2';
    for (let page of this.obsPages) {
      log.info(
        `Observation page ${this.currentPage - firstObsPage + 1} of ${
          this.obsPages.length
        }`
      );
      if (this.isPageInRange()) {
        await this.addChartPage(page);
      }
      lastScore = page.score_system;
      this.nextPage();
    }
    await this.createBackPages(lastScore);
  }

  async addBasicPage(name: PageName): Promise<void> {
    if (!this.isPageInRange()) return;

    const page = this.layout[name];
    if (!this.newPage) {
      this.doc.addPage();
    }
    this.newPage = false;

    this.doc.translate(...this.translate);

    log.info(`Processing page ${name}`);
    await this.drawBackground(page);

    this.drawGridOnPage(page.grid);

    if (page.fields) {
      let fieldDefaults: Field = {
        x: 100,
        y: 100,
        width: 200,
        font: this.fonts.normal,
        fontSize: 10,
        captionFont: this.fonts.normal,
        captionSize: 10,
        caption: null,
        type: '',
        radius: 9,
        height: 10,
        text: '',
        name: ''
      };
      for (let partialField of page.fields) {
        const field: Field = { ...fieldDefaults, ...(partialField as Field) };

        const fieldValue: string = this.patient.getField(field.name);
        if (field.name === '') {
          // A field with no name simply updates the defaults
          // for following fields.
          fieldDefaults = field;
        } else
          switch (field.type) {
            case 'html':
              this.plotHTML(fieldValue, field);
              break;
            case 'table':
              this.plotTable(field);
              break;
            case 'svg':
              await this.plotSvg(fieldValue, field);
              break;
            default:
              this.plotText(fieldValue, field);
              break;
          }
      }
    }
  }

  async drawBackground(page: BasePage): Promise<void> {
    if (page.background) {
      const svgBackground = await readFile(page.background, 'utf-8');

      SVGtoPDF(this.doc, svgBackground, 0, 0, {
        width: this.doc.page.width,
        height: this.doc.page.height,
        fontCallback: this.getFontCallback()
      });
    }
  }

  getFontCallback(): (family: string) => string {
    // Function to be used by svg code to map SVG fonts to PDF fonts
    return (family: string): string => {
      family = family.split(',')[0];
      family = family.replace(/['"](.*)['"]$/, '$1');

      const mapped = this.fontMapping[family.toLowerCase()];
      if (mapped) return mapped;
      return family;
    };
  }

  async addChartPage(page: PageModel): Promise<void> {
    var cols;
    var sects;
    var specCol;
    var fullMessTop;
    if (page.score_system=="meows") {
      await this.addBasicPage('meows');
      cols = this.meowsColumns;
      sects = this.meowsSections;
      specCol = this.meowsSpecialColumnSections;
      fullMessTop = this.meowsFullMessageTop;
    } else {
      await this.addBasicPage('news2');
      cols = this.newsColumns;
      sects = this.newsSections;
      specCol = this.news2SpecialColumnSections;
      fullMessTop = this.news2FullMessageTop;
    }
    for (let [index, obs] of page.observation_sets.entries()) {
      const column = cols.columnInfo[index];
      let sections = sects;
      let skipSymbols = false;

      switch (obs.specialType) {
        case NO_READINGS_FOR_24_HOURS:
        case SCORE_SYSTEM_CHANGE:
          // Typecast needed as typescript doesn't really know about using a symbol as an attribute name.
          this.drawVerticalText(
            this.messages[obs.specialType],
            column,
            fullMessTop,
            column.bottom
          );
          sections = specCol;
          skipSymbols = true;
          break;
        default:
          break;
      }

      for (let section of sections) {
        const reading = obs[section.name as keyof ObservationSetBase];
        if (reading === null || reading === undefined) {
          log.warn(`Undefined reading ${section.name} column ${column.index}`);
          continue;
        }

        if (isSpecialValue(reading)) {
          if (!skipSymbols) {
            this.drawSymbolMessage(section, column, reading);
          }
          continue;
        }

        switch (section.type) {
          case 'blank': // Section marked as blank is not displayed.
            break;
          case 'bands':
            if (assertObservationReading(reading)) {
              this.plotInBand(section, column, reading);
            }
            break;
          case 'dot':
            if (assertObservationReading(reading)) {
              this.plotDot(section, column, reading);
            }
            break;
          case 'candle':
            if (assertObservationPair(reading)) {
              this.plotCandle(section, column, reading);
            }
            break;
          default:
            if (assertObservationReading(reading)) {
              this.plotCellValue(section, column, reading);
            }
            break;
        }
        if (section.box) {
          this.drawBoxOutline(section, column);
        }
      }
    }
  }

  plotHTML(html: string, field: HtmlField): void {
    const fonts: FontMapping = this.fonts;

    let paras = htmlToTextSegments(fonts, html);

    const opt = {
      align: 'left',
      baseline: 'alphabetic',
      lineBreak: false,
      width: field.width || 150,
      ...field.opt,
      continued: true,
      paragraphGap: field.fontSize / 2
    };

    const doc = this.doc;
    doc
      .save()
      .font(field.font)
      .fontSize(field.fontSize)
      .text('', field.x, field.y, { ...opt, continued: true });

    for (let content of paras) {
      for (let [text, font, continued] of content) {
        doc.font(font).text(text, { ...opt, continued: continued });
      }
    }

    doc.restore();
  }

  plotTable(field: TableField): void {
    this.drawTableBoxAndGrid(field);

    let cells: (string | Partial<TextField | HtmlField>)[][];
    let rowDefaults = field.rowDefaults;

    if (field.column_names) {
      if (field.name != 'nurse_concern') {
        log.error('Table output only supported for nurse_concern');
        return;
      }
      const concerns: NurseConcern[] = this.patient.nurse_concern;
      cells = concerns.map((r: NurseConcern): Partial<TextField>[] =>
        field.column_names.map(
          (name: string): Partial<TextField> => ({
            text: r[name as keyof NurseConcern] || ''
          })
        )
      );
      rowDefaults = concerns.map((): Partial<TextField> => ({}));
    } else {
      cells = field.cells;
    }

    // Make sure we have a field.rows entry for every row of cells.
    let rows = field.rows;
    if (cells.length > rows.length) {
      if (rows.length === 1) {
        rows.push(2 * rows[0]);
      }
      while (cells.length > rows.length) {
        const last = rows.length - 1;
        rows.push(2 * rows[last] - rows[last - 1]);
      }
    }

    for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
      this.plotTableRow(
        cells[rowIndex],
        field,
        rowIndex,
        rowDefaults[rowIndex]
      );
    }
  }

  drawTableBoxAndGrid(field: TableField): void {
    const gridColour = field.border;
    if (gridColour !== null) {
      const doc = this.doc;
      doc
        .save()
        .roundedRect(field.x, field.y, field.width, field.height, field.radius)
        .lineWidth(0.5)
        .stroke(gridColour);
      for (let column of field.columns) {
        doc
          .moveTo(field.x + column, field.y)
          .lineTo(field.x + column, field.y + field.height);
      }
      for (let row of field.rows) {
        doc
          .moveTo(field.x + field.cellpadding, field.y + row)
          .lineTo(field.x + field.width - field.cellpadding, field.y + row);
      }
      doc.stroke(gridColour).restore();
    }
  }

  plotTableRow(
    row: TableCell[],
    field: TableField,
    rowIndex: number,
    rowDefault: Partial<TextField | HtmlField>
  ): void {
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const col = row[colIndex];
      const value = typeof col === 'string' ? { text: col } : col;

      const { left, top, width, height } = tableCellDimensions(
        field,
        colIndex,
        rowIndex
      );

      let cellfield: Field = {
        ...field,
        name: '',
        x: 0,
        y: 0,
        ...rowDefault,
        width,
        height,
        ...value
      };

      let point = {
        x: left + field.x + cellfield.x,
        y: top + field.y + field.fontSize + cellfield.y,
        width: cellfield.width - cellfield.x,
        height: cellfield.height - cellfield.y
      };

      cellfield = { ...cellfield, ...point };

      if (this.fonts.hasOwnProperty(cellfield.font)) {
        cellfield.font = this.fonts[cellfield.font];
      }

      const text =
        cellfield.name === ''
          ? cellfield.text
          : this.patient.getField(cellfield.name);

      if (cellfield.type === 'html') {
        this.plotHTML(text, cellfield);
      } else {
        this.plotText(text, cellfield);
      }
    }
  }

  plotText(text: string | undefined, field: Field): void {
    const doc = this.doc;
    if (!text && field.name === 'text') {
      text = field.text;
    }

    if (!text) {
      return;
    }

    const opt = {
      align: 'left',
      baseline: 'alphabetic',
      lineBreak: false,
      width: field.width,
      ...field.opt
    };
    if (field.caption !== null) {
      opt.align = 'right';
    }

    doc
      .save()
      .font(field.font)
      .fontSize(field.fontSize)
      .text(text, field.x, field.y, opt);

    if (field.caption !== null) {
      const textWidth = doc.widthOfString(' ' + text, opt);
      const optLeft = { ...opt, align: 'left' };
      doc.font(field.captionFont).fontSize(field.captionSize);

      const captionWidth = doc.widthOfString(field.caption + ' ', optLeft);
      doc
        .text(field.caption, field.x, field.y, optLeft)
        .moveTo(field.x + captionWidth, field.y)
        .lineTo(Math.floor(field.x + opt.width - textWidth), field.y)
        .dash(1, { space: 2 })
        .stroke();
    }

    doc.restore();
  }

  async plotSvg(filename: string, field: SvgField): Promise<void> {
    let svgFile;
    try {
      svgFile = await readFile(filename, 'utf-8');
    } catch (e) {
      log.error(`Failed to load ${field.name} `, e);
      return;
    }

    SVGtoPDF(this.doc, svgFile, field.x, field.y, {
      width: field.width,
      height: field.height,
      assumePt: true,
      preserveAspectRatio: 'xMaxYMax meet',
      fontCallback: this.getFontCallback()
    });
  }

  plotCellValue(
    section: ChartSection,
    column: ColumnInfo,
    reading: ObservationReading
  ): void {
    const doc = this.doc;

    const display = this.getDisplayReading(reading, section);

    if (
      section.bgColours &&
      assertObservationJson(reading) &&
      reading.observation_value !== null
    ) {
      const colour = section.bgColours[reading.observation_value];
      if (colour === undefined) {
        log.error(
          `Missing background colour, section ${section.name}, value ${reading.observation_value}`
        );
      }

      doc
        .save()
        .rect(column.left, section.top, column.width, section.rowHeight);
      if (section.border) {
        doc.fillAndStroke(colour, section.border);
      } else {
        doc.fill(colour);
      }
      doc.restore();
    }
    this.drawNimbusText(section, column, section.rowY(0), display);
  }

  plotInBand(
    section: ChartSection,
    column: ColumnInfo,
    reading: ObservationReading
  ): void {
    let numeric = this.getNumericReading(reading, section);
    let display = this.getDisplayReading(reading, section);

    this.drawNimbusText(
      section,
      column,
      section.rowY(section.row(numeric)),
      display
    );
  }

  plotCandle(
    section: ChartSection,
    column: ColumnInfo,
    reading: ObservationPair
  ): void {
    // Readings for a candle chart must contain two values: low and high
    const doc = this.doc;
    const { high, low } = reading;
    if (section.candle === undefined) {
      log.error(`${section.name} missing candle definition`);
      return;
    }
    if (isSpecialValue(high)) {
      this.drawSymbolMessage(section, column, high);
      return;
    } else if (isSpecialValue(low)) {
      this.drawSymbolMessage(section, column, low);
      return;
    }
    const numericHigh = this.getNumericReading(high, section);
    const numericLow = this.getNumericReading(low, section);
    const displayHigh = this.getDisplayReading(high, section);
    const displayLow = this.getDisplayReading(low, section);

    const highPosition = section.candleY(numericHigh);
    const lowPosition = section.candleY(numericLow);
    let centre = column.centre;
    let leftOffset = 0;
    if (high.observation_metadata && high.observation_metadata.patient_position) {
      leftOffset = -4;
      centre -= 4;
    }
    const barWidth = 2;

    doc
      .save()
      .lineWidth(1)
      .strokeColor(section.colour || '#000000')
      .moveTo(centre, highPosition)
      .lineTo(centre, lowPosition)
      .stroke()
      .fillColor(section.colour || '#000000')
      .fillOpacity(1);
    let textPositionHigh = section.rowY(section.rows - 1);
    let textPositionLow = section.rowY(0);

    if (numericHigh < section.candle.high) {
      doc
        .polygon(
          [centre - barWidth, highPosition - barWidth],
          [centre + barWidth, highPosition - barWidth],
          [centre, highPosition]
        )
        .fillAndStroke();
      textPositionHigh = highPosition - section.fontSize / 2 - POINT_OFFSET;
    }
    if (numericLow > section.candle.low) {
      doc
        .polygon(
          [centre - barWidth, lowPosition + barWidth],
          [centre + barWidth, lowPosition + barWidth],
          [centre, lowPosition]
        )
        .fillAndStroke();
      textPositionLow = lowPosition + section.fontSize / 2 + POINT_OFFSET;
    }
    if (high.observation_metadata && high.observation_metadata.patient_position)
    {
      let observation_metadata: ObservationMetadataJson = high.observation_metadata
      let positionPosition = observation_metadata.patient_position;
      let positionPositionY = (textPositionHigh + textPositionLow) / 2;
      let filename = "config/positions/" + positionPosition + ".svg";
      let svg = readFileSync(filename, 'utf-8').toString();
      let options = {
        width: 13,
        height: 13,
        assumePt: true,
        preserveAspectRatio: 'xMaxYMax meet'
      }
      SVGtoPDF(doc, svg, column.right - 15, positionPositionY - 6, options);
    }
    doc.restore();
    this.drawNimbusText(section, column, textPositionHigh, displayHigh, leftOffset);
    this.drawNimbusText(section, column, textPositionLow, displayLow, leftOffset);
  }



  plotDot(
    section: ChartSection,
    column: ColumnInfo,
    reading: ObservationReading | SpecialValue
  ): void {
    if (isSpecialValue(reading)) {
      this.drawSymbolMessage(section, column, reading);
      return;
    }

    let numeric = this.getNumericReading(reading, section);
    let displayValue = this.getDisplayReading(reading, section);

    if (numeric <= section.low) {
      this.drawTriangle(
        displayValue,
        'down',
        section.rowY(0),
        2,
        section,
        column
      );
    } else if (numeric >= section.high) {
      this.drawTriangle(
        displayValue,
        'up',
        section.rowY(section.rows - 1),
        2,
        section,
        column
      );
    } else {
      const yPos = section.pointY(numeric);

      this.doc
        .save()
        .circle(column.centre, yPos, 2)
        .lineWidth(0)
        .fillOpacity(1)
        .fillAndStroke(section.colour)
        .restore();
      this.drawNimbusText(
        section,
        column,
        yPos - section.fontSize / 2 - POINT_OFFSET,
        displayValue
      );
    }
  }

  getDisplayReading(
    reading: ObservationReading,
    section: ChartSection
  ): string {
    let display: string =
      typeof reading === 'string'
        ? reading
        : typeof reading == 'number'
        ? reading.toString()
        : reading.observation_string !== null
        ? reading.observation_string
        : reading.observation_value !== null
        ? reading.observation_value.toString()
        : '';

    if (section.display) {
      const mapping = this.layout.news2[
        section.display as keyof ChartPage
      ] as DisplayMapping;
      if (mapping && mapping.hasOwnProperty(display)) {
        display = mapping[display].displayName;
      } else if (mapping && mapping.hasOwnProperty(display.toLowerCase())) {
        display = mapping[display.toLowerCase()].displayName;
      }
    }
    return display;
  }

  getNumericReading(
    reading: ObservationReading,
    section: ChartSection
  ): number {
    if (typeof reading == 'string') {
      return parseFloat(reading);
    }

    let numeric =
      typeof reading === 'number'
        ? reading
        : reading.observation_value !== null
        ? reading.observation_value
        : 0;
    const obs_str =
      typeof reading === 'number'
        ? reading.toString()
        : reading.observation_string;

    if (section.display) {
      const mapping = this.layout.news2[
        section.display as keyof ChartPage
      ] as DisplayMapping;
      if (mapping) {
        const mapped =
          mapping[numeric] ||
          mapping[obs_str] ||
          mapping[obs_str.toLowerCase()];

        if (mapped != null) {
          numeric = mapped.value !== undefined ? mapped.value : numeric;
        }
      }
    }
    return numeric;
  }

  drawSymbolMessage(
    section: ChartSection,
    column: ColumnInfo,
    reading: SpecialValue
  ): void {
    switch (reading) {
      case REFUSED:
      case SCORE_SYSTEM_CHANGE:
      case MISSING:
      case NO_READINGS_FOR_24_HOURS: {
        this.drawVerticalText(
          this.messages[reading],
          column,
          section.messageTop,
          section.messageBottom,
          'centre'
        );
        break;
      }
      default:
        unreachableCode(reading);
    }
  }

  drawNimbusText(
    section: ChartSection,
    column: ColumnInfo,
    y: number,
    text: string,
    leftOffset: number = 0
  ): void {
    // Outputs text with a nimbus (or halo) to improve legibility against coloured backgrounds
    const doc = this.doc;
    const { width, left } = column;
    let opt = {
      baseline: 'middle',
      width,
      align: 'center',
      height: doc.page.height,
      stroke: true
    };
    opt.stroke = true;
    doc.save();

    doc
      .font(section.font)
      .fontSize(section.fontSize)
      .fillColor(section.colour)
      .strokeColor('#ffffff')
      .strokeOpacity(0.7)
      .lineWidth(2)
      .text(text, left + leftOffset, y, opt);
    opt.stroke = false;
    doc
      .fillColor(section.colour)
      .strokeColor(section.colour)
      .lineWidth(0)
      .text(text, left + leftOffset, y, opt);
    doc.restore();
  }

  drawVerticalText(
    message: MessageText,
    column: ColumnInfo,
    top: number,
    bottom: number,
    align: 'left' | 'right' | 'centre' | null = null
  ): void {
    const doc = this.doc;
    const { left, centre, width, row_height } = column;
    let { text, bgColour } = { ...MESSAGE_DEFAULTS, ...message };
    if (!text) {
      return;
    }

    const y = bottom;
    const margin = row_height;
    const rotatedBoxWidth = bottom - top;
    const optLeft = {
      baseline: 'middle',
      width: rotatedBoxWidth - 2 * margin,
      align: 'left'
    };
    const optCentre = { ...optLeft, width: rotatedBoxWidth, align: 'center' };
    const optRight = { ...optLeft, align: 'right' };


    //width appears to calculate incorrectly make size 80% to be more accurate
    const messageWidth = doc.widthOfString(message + '') * 0.8;
    if (messageWidth > rotatedBoxWidth) {
      log.error(`Message ${text} too long! (l:${left}, t:${top} mw:${messageWidth}, h:${rotatedBoxWidth})`, messageWidth, rotatedBoxWidth);
    }

    doc
      .save()
      .fillColor(bgColour)
      .strokeColor(bgColour)
      .fillOpacity(0.9)
      .lineWidth(1)
      .rect(left, top, width, rotatedBoxWidth)
      .fillAndStroke()
      .restore()
      .save()
      .rotate(-90, { origin: [centre, y] });

    if (align == null || align === 'left') {
      doc.text(text, centre + margin, y, optLeft);
    }
    if (align == null || align === 'centre') {
      doc.text(text, centre, y, optCentre);
    }
    if (align == null || align === 'right') {
      doc.text(text, centre + margin, y, optRight);
    }
    doc.restore();
  }

  drawTriangle(
    caption: string,
    direction: 'up' | 'down',
    y: number,
    barWidth: number,
    section: ChartSection,
    column: ColumnInfo
  ): void {
    const { centre } = column;
    const doc = this.doc;

    doc
      .save()
      .lineWidth(1)
      .strokeColor(section.colour || '#000000')
      .fillColor(section.colour || '#000000')
      .fillOpacity(1);

    let textOffset;

    const yshift = barWidth / 2;
    if (direction === 'down') {
      doc
        .polygon(
          [centre - barWidth, y - yshift],
          [centre + barWidth, y - yshift],
          [centre, y + yshift]
        )
        .fillAndStroke();
      textOffset = -section.fontSize / 2 - POINT_OFFSET;
    } else {
      doc
        .polygon(
          [centre - barWidth, y + yshift],
          [centre + barWidth, y + yshift],
          [centre, y - yshift]
        )
        .fillAndStroke();
      textOffset = section.fontSize / 2 + POINT_OFFSET;
    }
    doc.restore();
    this.drawNimbusText(section, column, y + textOffset, caption);
  }

  // Draw a grid over all or part of the page.
  drawGridOnPage(grid?: Partial<Grid>): void {
    if (!grid || !grid.show) {
      return;
    }
    const doc = this.doc;
    let { left, top, width, height, space } = { ...GRID_DEFAULTS, ...grid };

    if (width == null) {
      width = doc.page.width - left;
    }
    if (height == null) {
      height = doc.page.height - top - 10;
    }
    const right = left + width;
    const bottom = top + height;

    doc
      .save()
      .polygon([left, top], [left, bottom], [right, bottom], [right, top])
      .stroke();

    let ctx = doc;
    for (let x = left + space; x < right; x += space) {
      ctx = ctx.moveTo(x, top).lineTo(x, bottom);
    }
    for (let y = top + space; y < bottom; y += space) {
      ctx = ctx.moveTo(left, y).lineTo(right, y);
    }
    ctx.dash(0.5, { space: 2 }).stroke();

    ctx = doc.undash().fontSize(8);

    // N.B. Set explicit height on text otherwise it can skip to next page when printing near the foot of the page.
    for (let x = left + space; x < right; x += space) {
      ctx.text(x.toString(), x - 10, top + 20, {
        align: 'center',
        width: 20,
        height: doc.page.height
      });
    }
    for (let y = top + space; y < bottom; y += space) {
      let s = y.toString();
      doc.text(s, 10, y - 3, { align: 'left', height: doc.page.height });
    }
    doc.restore();
  }

  drawBoxOutline(section: ChartSection, column: ColumnInfo): void {
    const { left, width } = column;
    const { bottom, rowHeight } = section;

    this.doc
      .save()
      .lineWidth(1)
      .strokeColor('#00ff00');

    for (let i = 0; i < section.rows; i++) {
      this.doc
        .rect(left, bottom - (i + 1) * rowHeight, width, rowHeight)
        .stroke();
    }
  }
}

const validateLayoutConfig = validate('LayoutConfig');

async function loadLayout(send_config: SendConfig): Promise<LayoutConfig> {
  let json: string;
  try {
    json = await readFile(`config/${CUSTOMER_CODE}/layout.json`);
  } catch (e) {
    json = await readFile(`config/layout.json`);
  }
  const layout = validateLayoutConfig(JSON.parse(json));
  if (send_config.bcp !== undefined) {
    const { pages_front, pages_back_news2, pages_back_meows } = send_config.bcp;
    if (pages_front !== undefined) {
      layout.pages_front = pages_front as PageName[];
    }
    if (pages_back_news2 !== undefined) {
      layout.pages_back_news2 = pages_back_news2 as PageName[];
    }
    if (pages_back_meows !== undefined) {
      layout.pages_back_meows = pages_back_meows as PageName[];
    }
  }
  return layout;
}

export async function generatePdf(
  json: JsonRequest,
  res: express.Response
): Promise<void> {
  const { patient, encounter, observation_sets, location, trustomer } = json;
  log.info(`Customer code is ${CUSTOMER_CODE}`);
  if (
    patient === undefined ||
    encounter === undefined ||
    observation_sets === undefined ||
    location === undefined ||
    trustomer.send_config === undefined
  ) {
    res.statusMessage = 'Badly formed request';
    res.status(400).end();
    return;
  }
  const layout = await loadLayout(trustomer.send_config);
  const chart = new ChartModel(
    patient,
    encounter,
    observation_sets,
    location,
    trustomer.send_config,
    CUSTOMER_CODE
  );
  const total_pages =
    layout.pages_front.length + layout.pages_back_news2.length + chart.pageCount;
  let first = 0,
    last = total_pages + 1;
  if (json.pages) {
    // Only want to generate a subset.
    first = json.pages.first;
    last = json.pages.last;
    if (last === undefined) {
      last = first + 1;
    }
    if (first < 0) {
      first = total_pages + first;
    }
    if (last < 0) {
      last = total_pages + last;
    }
  }
  const generator = new Generator(layout, chart);
  await generator.setupFonts();
  const filename = encodeURIComponent(
    `${chart.patient.hospital_number}-${chart.encounter.epr_encounter_id}.pdf`
  );

  // Setting response to 'attachment' (download).
  // If you use 'inline' here it will automatically open the PDF
  // res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"')
  res.setHeader('Content-disposition', 'inline; filename="' + filename + '"');
  res.setHeader('Content-type', 'application/pdf');

  await generator.createDocument(res, first, last);
}
