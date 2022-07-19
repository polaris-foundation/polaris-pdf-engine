# Polaris PDF Engine

The PDF Engine is part of the Polaris platform (formerly DHOS). This service is  a Node.js microservice to expose an API that generates BCP PDFs.

The PDF files are generated using Pdfkit (http://pdfkit.org/)

**This service is intended to be wrapped by the Polaris PDF API.** This service is expected to be running locally to the PDF Engine. For this reason, the API exposed by the PDF Engine is not protected by endpoint security.

# Running locally

```bash
yarn install
yarn test
yarn start
```

# Running in Docker

```bash
docker build -t dhos-pdf-engine/v19.1 . # once
docker run -p 3000:3000 -t dhos-pdf-engine/v19.1
```

# layout.json file format

The `layout.json` file controls the PDF generation: it defines the pages that are output, and the fields that are
placed on each page. Most json elements are optional and will have sensible defaults.

All x, y, width and height values are specified in points (and can be floating point if you need more precision). The
origin for coordinates is top-left with increasing `y` going down the paper.

## page

This element defines the basic page layout: paper size, margins, and optionally `translate` may be used to shift the
entire output relative to the paper.

```json
"page": {
    "size": "A4", "margins": {"top": 10, "bottom": 0, "left": 10, "right": 10},
    "translate": [0, -15]
  }
```

## Font aliases

The font used in the document is SourceSansPro. If the SVG files reference any other fonts these may be lists in a
`font_aliases` section that maps them to an existing font. Additional OTF fonts may be added in the `src/fonts` folder.

```json
  "font_aliases": {
    "HelveticaNeue-Medium": "SourceSansPro-Regular",
    "HelveticaNeue-Light": "SourceSansPro-Regular",
    "HelveticaNeue-Thin": "SourceSansPro-Light"
  }
```

## pages_front, pages_back

These two elements each specify a list of pages to be output before the chart pages and after the chart pages respectively.
Each page named by these sections references another top-level element in the JSON file.

```json
  "pages_front": ["cover_page", "threshold_page"],
  "news_pages_back": ["blank_chart_news2"],
  "meows_pages_back": ["blank_chart_meows"],
```

### Non-chart pages

Each page listed in `pages_front` or `pages_back` must have a corresponding section.

`background` specifies the path to an SVG file that will be used as the page background. The SVG is imported at
origin 0, 0 scaled to page width and page height.

Optional `grid` may be used to superimpose a dotted grid over the entire page so as to make it easier to work out the
placement of elements. Set `show` to `true` to display the grid, or `false` to turn the grid off (or omit the attribute
for no grid). `space` sets the spacing of lines in the grid.

```json
  "cover_page": {
    "grid": {"show": false, "space": 20},
    "fields": [...],
    "background": "config/COVER.svg"
  },
```

`fields` lists the elements to be placed on the page. It contains a list of field definition objects each with a `name`
attribute. Any object without a `name` attribute is not a field, but will be used to update the default values for
following fields on the page (defaults are reset at the start of each page).

```json
"fields": [
      {"fontSize": 12, "y": 100, "width": 150},
      {
        "name": "fullName", "x": 72
      }, {
        "name": "gender", "x": 310
      }]
```

This example would set a font size of 12pt, a field width of 150pt, and place fields at 100pt down from the origin then
output `fullName` and `gender` at different positions across the page.

Field names are as defined in `models/patient.ts`. A field named `text` may be used to output literal text given in
the `text` attribute.

Attributes for a field include `x`, `y`, `width`, `height`, `align` (left, right, or centre), `font`, `fontSize`.
Specifying `caption` (and optionally `captionFont` and `captionSize`) will force left aligned caption, right aligned
text, and a dot leader between the two. Caption may be `""` if the left-aligned text is already present in the background
to just produce dots and the field itself (if you do this across multiple fields set it back to `null` to turn off the
captioning mode).

An attribute `opt` if present may be used to specify less commonly used options to the pdfkit formatter. qv.

## chart

The `chart` attribute defines the chart pages. This element may contain all of the elements present for the non-chart
pages but also includes attributes which control how the observations are plotted.

```json
    "col1": {
      "left": 143, "width": 171, "top": 57.5, "bottom": 731.5, "row_height": 10.2
    },
    "col2": {
      "left": 336, "width": 171
    }
```

These elements define the horizontal positioning of readings in two blocks each containing 6 columns.
`top`, `bottom`, and `row_height` in `col1` are assumed to be the same in `col2`.

```json
    "messages": {
      "no_obs": {"text": "NO OBS FOR 24 HOURS "},
      "score_system_change": {"text": "CHANGE OF SCALE", "bgColour": "#eeeeee"},
      "missing": {},
      "refused": {"text": "REFUSED"}
    },
    "message_groups": [
      ["spo2_scale_1", "spo2_scale_2"], ["air", "o2PerMin", "o2Device"]
    ],
```

`messages` define the text to be displayed in a section for exceptional conditions such as `refused` or `scale change`.
`message_groups` is used to extend a single message over multiple contiguous sections (but refused all is hard-wired to
display over all sections except date and time).

`sections` defines how the columns are split horizontally. As with `fields` a section with no name may be used to change
the default values used for following sections.

Attributes that may be set in `sections` include:

- `name` identifies an attribute from `models/observations.ts`
- `type` (default 'simple') identifies the type of formatting used in this section.
- `bottom` sets the vertical position of this section.
- `messageBottom` sets the bottom position for an exception message if not the same as `bottom`.
- `rows` sets the number of cells vertically in this section. Defaults to the length of the `range` attribute (or 1
  if that attribute is not set)
- `low`, `high` used to set the limits for a `dot` chart.
- `candle` sets options for the blood pressure chart (`low`, `mid`, `high`, `lowRows`, `highRows`). The blood pressure
  chart has 2 different ranges so the vertical axis is different from low to mid than from mid to high.
- `bgColours` used for News2 score to map values to different background colours.
- `border` used for the cell border colour when `bgColours` is specified.
- `display` maps the observation value through an object defined under `chart`. See below.
- `box` set to true for a tasteful bright green box around each cell.

Valid types are `simple`, `bands` where each value is placed vertically according to the `range` attribute, `dot` for
a dot chart e.g. heart rate, `candle` for a candlebar chart (blood pressure), `blank` for a section that is not displayed.

Example for `display`:

```json
    "consciousness_map": {
      "Alert": {"displayName": "A", "value": 4},
      "Confusion": {"displayName": "C", "value": 3},
      "Voice": {"displayName": "V", "value": 2},
      "Pain": {"displayName": "P", "value": 1},
      "Unresponsive": {"displayName": "U", "value": 0}
    },
    "sections": [
      {
        "name": "acvpu", "bottom": 664.5, "display": "consciousness_map",
        "range": [0, 1, 2, 3, 4]
      }
    ]
    ...
```

This example maps `"Alert"` to `"A"` for display and uses a numeric value of 4 that will put the A on the top row of
the 5 row section.
