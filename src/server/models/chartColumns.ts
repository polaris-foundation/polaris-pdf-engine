import {ChartPage} from './layoutTypes';

const COLUMN_DEFAULTS = {row_height: 10, cells: 6};

export interface ColumnInfo {
    left: number;
    right: number;
    centre: number;
    width: number;
    row_height: number;
    top: number;
    bottom: number;
    index: number;
}

export class ChartColumns {
    public columnInfo: ColumnInfo[] = [];

    // This model stores the metrics for one column on the observation chart
    constructor(chart: ChartPage) {
        let top = 0, bottom = 0;
        for (let block of [chart.col1, chart.col2]) {
            const {row_height, cells} = {...COLUMN_DEFAULTS, ...block};
            top = block.top !== undefined ? block.top : top;
            bottom = block.bottom !== undefined ? block.bottom : bottom;

            for (let index = 0; index < cells; index++) {
                const width = block.width / cells;
                const left = block.left + width * (index % cells);
                const right = left + width;
                const centre = (left + right) / 2;
                this.columnInfo.push({left, right, centre, width, row_height, top, bottom, index});
            }
        }
    }
}
