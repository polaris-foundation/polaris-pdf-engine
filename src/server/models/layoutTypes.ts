export interface Margins {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface Page {
    size: string;
    margins: Margins;
    translate: [number, number];
}

export interface FontAliases {
    [face: string]: string;
}

export interface Grid {
    left: number;
    top: number;
    width: number | null;
    height: number | null;
    show: boolean;
    space: number;
}

export interface Opt {
    [key: string]: any;
}

export interface FieldBase {
    align?: string;
    caption: string | null;
    captionSize: number;
    captionFont: string;
    font: string;
    fontSize: number;
    name: string;
    opt?: Opt;
    text: string;
    height: number;
    width: number;
    x: number;
    y: number;
    radius: number;
}

export interface TextField extends FieldBase {
    type: 'text' | '';
}

export interface HtmlField extends FieldBase {
    type: 'html';
}

export interface SvgField extends FieldBase {
    type: 'svg';
    x: number;
    y: number;
    height: number;
    width: number;
}

export type TableCell = (Partial<TextField | HtmlField> | string);

export interface TableField extends FieldBase {
    type: "table";
    cellpadding: number;
    columns: number[];
    column_names: string[];
    rows: number[];
    rowDefaults: Partial<TextField | HtmlField>[];
    height: number;
    cells: TableCell[][];
    border: string | null;
}

export type Field = TextField | TableField | HtmlField | SvgField;

export interface BasePage {
    grid?: Partial<Grid>;
    fields: Partial<Field>[];
    background: string;
}

export interface MessageText {
    text?: string;
    bgColour?: string;
}

export interface Messages {
    [code: string]: MessageText;
}

export interface ConsciousnessMap {
    [code: string]: {
        displayName: string;
        value: number;
    };
}

export interface Column {
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    row_height?: number;
}

export interface BgColours {
    [level: string]: string;
}

export interface Candle {
    low: number;
    high: number;
    mid: number;
    lowRows: number;
    highRows: number;
}

export interface Section {
    bgColours: BgColours | null;
    border: string | null;
    borderWidth: number;
    bottom: number;
    box: boolean;
    colour: string;
    candle?: Candle;
    display: string | null;
    font: string;
    fontSize: number;
    height: number;
    high: number;
    low: number;
    messageBottom?: number;
    messageTop?: number;
    name: string;
    range: number[];
    rows: number;
    type: string;
}

export interface ChartPage extends BasePage {
    col1: Column;
    col2: Column;
    consciousness_map: ConsciousnessMap;
    message_groups: string[][];
    messages: Messages;
    sections: Partial<Section>[];
}

export type PageName = "meows" | "news2" | "cover_page" | "threshold_4cols" | "threshold_5cols" | "blank_chart_news2" | "blank_chart_meows";

export interface LayoutConfig {
    page: Page;
    font_aliases: FontAliases;
    fonts?: { [face: string]: string };
    pages_front: PageName[];
    pages_back_news2: PageName[];
    pages_back_meows: PageName[];
    cover_page: BasePage;
    threshold_4cols: BasePage;
    threshold_5cols: BasePage;
    blank_chart_news2: BasePage;
    blank_chart_meows: BasePage;
    news2: ChartPage;
    meows: ChartPage;
}
