import {BgColours, Candle, Section} from "./layoutTypes";

export class ChartSection {
    name: string;
    type: string;
    bottom: number;
    range: number[];
    font: string;
    fontSize: number;
    height: number;
    colour: string;
    box: boolean;
    display: string | null;
    bgColours: BgColours | null;
    border: string | null;
    borderWidth: number;
    low: number;
    high: number;
    candle?: Candle;
    rowCount: number;
    messageTop: number;
    messageBottom: number;

    // This model stores the metrics for one section in the observation chart.
    // A section might contain many individual rows.
    constructor(sectionInfo: Section, public rowHeight: number) {
        ({
            name: this.name,
            type: this.type,
            bottom: this.bottom,
            range: this.range,
            font: this.font,
            fontSize: this.fontSize,
            height: this.height,
            colour: this.colour,
            box: this.box,
            display: this.display,
            bgColours: this.bgColours,
            border: this.border,
            borderWidth: this.borderWidth,
            low: this.low,
            high: this.high,
            candle: this.candle,
            rows: this.rowCount
        } = sectionInfo);

        if (this.candle) {
            this.type = 'candle';
            this.rowCount = this.candle.lowRows + this.candle.highRows + 2;
        }

        const {messageTop = this.top, messageBottom = this.bottom} = sectionInfo;
        this.messageBottom = messageBottom;
        this.messageTop = messageTop;
    }

    get rows(): number {
        return this.rowCount ? this.rowCount : this.range.length ? this.range.length : 1;
    }

    get top(): number {
        return this.bottom - this.rows * this.rowHeight;
    }

    row(value: number): number {
        if (this.range) {
            let rowIdx = 0;
            for (; rowIdx < this.range.length; rowIdx++) {
                if (value <= this.range[rowIdx]) break;
            }
            return rowIdx;
        }
        return 0;
    }

    rowY(row: number): number {
        return this.bottom - (this.rowHeight * row) - this.rowHeight / 2;
    }

    pointY(value: number): number {
        const height = this.rowHeight * (this.rows - 2);
        const offset = (value - this.low) / (this.high - this.low) * height;
        return this.bottom - this.rowHeight - offset;
    }

    candleY(value: number): number {
        // Candle chart isn't linear, we have two separate ranges low to high.
        if (this.candle === undefined) return 0;
        const {low, high, mid, lowRows, highRows} = this.candle;
        const rowHeight = this.rowHeight;

        let offset;

        if (value <= low) {
            offset = 0;
        } else if (value >= high) {
            offset = rowHeight * (lowRows + highRows);
        } else if (value > mid) {
            offset = (value - mid) / (high - mid) * (rowHeight * highRows) + (rowHeight * lowRows);
        } else {
            offset = (value - low) / (mid - low) * (rowHeight * lowRows);
        }
        return this.bottom - rowHeight - offset;
    }
}
