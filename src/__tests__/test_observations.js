const fs = require('fs');
const { ChartModel } = require('../server/models/chart');
const {
  REFUSED,
  SCORE_SYSTEM_CHANGE,
  MISSING,
  NO_READINGS_FOR_24_HOURS
} = require('../server/util/symbols');
const { ObservationSetBase } = require('../server/models/observations');

describe('extracting fields', () => {
  let obs;
  beforeEach(() => {
    const observations = JSON.parse(
      fs.readFileSync('src/__tests__/sample_observations.json', 'utf8')
    );
    const encounter = {
      epr_encounter_id: '1234',
      score_system_history: [
        {
          changed_time: '2019-02-04T12:00:00.123Z',
          score_system: 'news2',
          spo2_scale: 2,
          changed_by: { first_name: 'Hank', last_name: 'Pym', uuid: 'AM' }
        },
        {
          changed_time: '2019-02-07T00:20:00.123Z',
          score_system: 'news2',
          spo2_scale: 2,
          changed_by: { first_name: 'Hank', last_name: 'Pym', uuid: 'AM' }
        }
      ]
    };
    obs = new ChartModel(null, encounter, observations, null, {
      news2: {},
      nurse_concern: []
    });
  });

  test('splits into pages', () => {
    expect(obs.pageCount).toBe(4);
  });

  test('returns dates', () => {
    expect(obs.pages[0].dates).toEqual([
      '31 Jan 19',
      '1 Feb 19',
    ]);
    expect(obs.pages[1].dates).toEqual([
      '2 Feb 19',
      '3 Feb 19',
      '3 Feb 19',
      '4 Feb 19',
      '4 Feb 19',
      '4 Feb 19',
      NO_READINGS_FOR_24_HOURS,
      '',
      '6 Feb 19',
      '7 Feb 19',
      '7 Feb 19',
      '',
    ]);
    expect(obs.pages[2].dates).toEqual([

      '7 Feb 19',
      NO_READINGS_FOR_24_HOURS,
      '9 Feb 19',
      '9 Feb 19',
      '',
      '10 Feb 19',
      '',
      '11 Feb 19',
      '11 Feb 19',
      '12 Feb 19',
      '13 Feb 19',
      '14 Feb 19',
    ]);
    expect(obs.pages[3].dates).toEqual([

      NO_READINGS_FOR_24_HOURS,
      '15 Apr 19'
    ]);
  });

  test('returns times', () => {
    expect(obs.pages[0].times).toEqual([
      '15:56',
      '10:50'
    ]);
    expect(obs.pages[1].times).toEqual([
      '05:51',
      '00:48',
      '16:24',
      '04:38',
      '12:00',
      '23:36',
      NO_READINGS_FOR_24_HOURS,
      '',
      '06:43',
      '00:20',
      '00:24',
      ''
    ]);

    expect(obs.pages[2].times).toEqual([
      '13:17',
      NO_READINGS_FOR_24_HOURS,
      '11:54',
      '21:26',
      '',
      '07:57',
      '',
      '05:14',
      '21:13',
      '06:58',
      '04:12',
      '01:55'
    ]);

    expect(obs.pages[3].times).toEqual([
      NO_READINGS_FOR_24_HOURS,
      '02:26'
    ]);
  });

  test('returns spo2Scale', () => {
    expect(obs.pages[0].spo2Scale).toEqual([
      undefined,
      1

    ]);
  });

  test('returns bp', () => {
    expect(obs.pages[0].bp).toEqual([
      [114, MISSING],
      [129, 74]

    ]);
    expect(obs.pages[1].bp).toEqual([
      [REFUSED, REFUSED],
      [112, 70],
      [122, 78],
      [MISSING, MISSING],
      [SCORE_SYSTEM_CHANGE, SCORE_SYSTEM_CHANGE],
      [110, 52],
      [NO_READINGS_FOR_24_HOURS, NO_READINGS_FOR_24_HOURS],
      [SCORE_SYSTEM_CHANGE, SCORE_SYSTEM_CHANGE],
      [MISSING, MISSING],
      [SCORE_SYSTEM_CHANGE, SCORE_SYSTEM_CHANGE],
      [130, 86],
      [SCORE_SYSTEM_CHANGE, SCORE_SYSTEM_CHANGE],
      
    ]);
    expect(obs.pages[2].bp).toEqual([
      [123, 74],
      [NO_READINGS_FOR_24_HOURS, NO_READINGS_FOR_24_HOURS],
      [114, MISSING],
      [MISSING, MISSING],
      [SCORE_SYSTEM_CHANGE, SCORE_SYSTEM_CHANGE],
      [120, 69],
      [SCORE_SYSTEM_CHANGE, SCORE_SYSTEM_CHANGE],
      [MISSING, MISSING],
      [REFUSED, 80],
      [128, 76],
      [129, 73],
      [128, MISSING]

    ]);
    expect(obs.pages[3].bp).toEqual([

      [NO_READINGS_FOR_24_HOURS, NO_READINGS_FOR_24_HOURS],
      [REFUSED, 62]
    ]);
  });

  test('returns temperature', () => {
    expect(
      obs.pages[0].temperature.map(t =>
        typeof t === 'symbol' ? t : t.observation_value
      )
    ).toEqual([
      37.1,
      37.5,
      
    ]);
    expect(
      obs.pages[1].temperature.map(t =>
        typeof t === 'symbol' ? t : t.observation_value
      )
    ).toEqual([
      37.4,
      36.9,
      37.1,
      37.3,
      SCORE_SYSTEM_CHANGE,
      36.8,
      NO_READINGS_FOR_24_HOURS,
      SCORE_SYSTEM_CHANGE,
      MISSING,
      SCORE_SYSTEM_CHANGE,
      36.6,
      SCORE_SYSTEM_CHANGE,

    ]);
    expect(
      obs.pages[2].temperature.map(t =>
        typeof t === 'symbol' ? t : t.observation_value
      )
    ).toEqual([
      37,
      NO_READINGS_FOR_24_HOURS,
      37,
      MISSING,
      SCORE_SYSTEM_CHANGE,
      37,
      SCORE_SYSTEM_CHANGE,
      MISSING,
      36.6,
      36.9,
      36.6,
      37
    ]);
    expect(
      obs.pages[3].temperature.map(t =>
        typeof t === 'symbol' ? t : t.observation_value
      )
    ).toEqual([NO_READINGS_FOR_24_HOURS, 37.3]);
  });

  test('diastolic bloodpressure', () => {
    let ObsSet = new ObservationSetBase();
    ObsSet.diastolic_blood_pressure = {};
    ObsSet.diastolic_blood_pressure.observation_value = 100;
    expect(ObsSet.diastolicBloodPressure).toEqual(100);

    ObsSet.diastolic_blood_pressure.observation_value = null;
    expect(ObsSet.diastolicBloodPressure).toEqual(MISSING);

  });

  test('systolic bloodpressure', () => {
    let ObsSet = new ObservationSetBase();
    ObsSet.systolic_blood_pressure = {};
    ObsSet.systolic_blood_pressure.observation_value = 100;
    expect(ObsSet.systolicBloodPressure).toEqual(100);

    ObsSet.systolic_blood_pressure.observation_value = null;
    expect(ObsSet.systolicBloodPressure).toEqual(MISSING);

  });
});
