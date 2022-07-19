import {
  EncounterJson,
  LocationJson,
  ObservationJson,
  ObservationSetJson,
  PatientJson,
  SendConfig
} from './jsonTypes';

import {
  MissedObservations,
  ObservationSet,
  ObservationSetBase,
  ScoreSystemChange
} from './observations';
import { PatientModel } from './patient';
import { SpecialValue } from '../util/symbols';

export { REFUSED, SCORE_SYSTEM_CHANGE, MISSING } from '../util/symbols';

const PAGE_LENGTH = 12;
const NO_OBS_LIMIT_HOURS = 24;

export class PageModel {
  constructor(public observation_sets: ObservationSetBase[], public score_system: string) {}

  get dates(): (SpecialValue | string | null)[] {
    return this.observation_sets.map(o => o.date);
  }

  get times(): (SpecialValue | string | null)[] {
    return this.observation_sets.map(o => o.time);
  }

  get bp(): [number | SpecialValue, number | SpecialValue][] {
    return this.observation_sets.map(o => o.bp);
  }

  get temperature(): (ObservationJson | SpecialValue)[] {
    return this.observation_sets.map(o => o.temperature);
  }

  get spo2Scale(): (SpecialValue | number | null)[] {
    return this.observation_sets.map(o => o.spo2_scale);
  }
}

type StringProperties<T> = Pick<
  T,
  { [K in keyof T]: T[K] extends string ? K : never }[keyof T]
>;

// Returns a sort comparison function that will operate on the named field,
// only string properties of T may be used, a compile-time error will result if any other
// property is passed to compareDateTime.
function compareDateTime<
  T,
  S extends { [K in keyof StringProperties<T>]: string }
>(fieldName: keyof StringProperties<T>): (a: S, b: S) => 1 | 0 | -1 {
  return (a: S, b: S): 1 | 0 | -1 => {
    const aRecord = new Date(a[fieldName]);
    const bRecord = new Date(b[fieldName]);

    if (aRecord > bRecord) return 1;
    if (aRecord < bRecord) return -1;
    return 0;
  };
}

export class ChartModel {
  public readonly patient: PatientModel;
  public readonly pages: PageModel[];
  private observationSets: ObservationSetJson[];
  public encounter: EncounterJson;
  private send_config: SendConfig;

  constructor(
    patient: PatientJson,
    encounter: EncounterJson,
    observationSets: ObservationSetJson[],
    location: LocationJson,
    send_config: SendConfig,
    customer_code: string
  ) {
    this.patient = new PatientModel(
      patient,
      encounter,
      location,
      send_config,
      customer_code
    );
    this.pages = [];
    this.observationSets = observationSets;
    this.encounter = encounter;
    this.send_config = send_config;

    const allObsIncludingSpecials = this.expandedObsList();

    // Split the obs into pages

    var index=1;
    var count=0;
    var lastValidEWS='';
    var currentEWS='';

    allObsIncludingSpecials.forEach(obs => {
      if (obs.score_system!='') {
        currentEWS = obs.score_system;
      }
      count++;
      if (
        (lastValidEWS!='' && currentEWS!=lastValidEWS)
        ||
        count===PAGE_LENGTH
      ) {
        let page = new PageModel(allObsIncludingSpecials.slice(index - count, index), lastValidEWS);
        this.pages.push(page);
        count=0;

      }

      lastValidEWS = currentEWS;

      index++;
    });

    if (count>0){
      let page = new PageModel(allObsIncludingSpecials.slice(index-count-1, index-1), lastValidEWS);
      this.pages.push(page);
    }

  }

  // Build list of observation sets plus special entries for score system change and missed observations
  expandedObsList(): ObservationSetBase[] {
    let lastScoreSystem: number | null = null;
    let lastRecordTime = null;
    const NoObsLimit = NO_OBS_LIMIT_HOURS * 60 * 60 * 1000;

    this.observationSets.sort(compareDateTime('record_time'));

    let scoreSystemHistory: ScoreSystemChange[] = [];
    if (this.encounter.score_system_history) {
      // Sort scale changes, oldest first.
      this.encounter.score_system_history.sort(compareDateTime('changed_time'));
      scoreSystemHistory = this.encounter.score_system_history.map(
        ssc => new ScoreSystemChange(ssc)
      );
    }

    let allObsIncludingSpecials: ObservationSetBase[] = [];

    for (let obset of this.observationSets) {
      const observationSet = new ObservationSet(obset, this.send_config);
      if (observationSet.record_time != null) {
        if (
          lastRecordTime !== null &&
          observationSet.record_time.getTime() - lastRecordTime > NoObsLimit
        ) {
          allObsIncludingSpecials.push(new MissedObservations(lastScoreSystem));
        }
        lastRecordTime = observationSet.record_time.getTime();

        let scoreSystemChange: ScoreSystemChange | undefined;
        while ((scoreSystemChange = scoreSystemHistory.shift()) !== undefined) {
          if (
            scoreSystemChange.record_time == null ||
            scoreSystemChange.record_time.getTime() >= lastRecordTime
          ) {
            scoreSystemHistory.unshift(scoreSystemChange);
            break;
          }

          lastScoreSystem =
            typeof scoreSystemChange.spo2_scale == 'number'
              ? scoreSystemChange.spo2_scale
              : null;
          allObsIncludingSpecials.push(scoreSystemChange);
        }
      }

      if (
        lastScoreSystem != null &&
        lastScoreSystem !== observationSet.spo2_scale &&
        typeof observationSet.spo2_scale == 'number'
      ) {
        // Score System has changed but we didn't get a history entry for exact time of change
        allObsIncludingSpecials.push(
          new ScoreSystemChange({
            score_system: observationSet.score_system,
            spo2_scale: observationSet.spo2_scale,
            changed_time: ''
          })
        );
      }
      lastScoreSystem =
        typeof observationSet.spo2_scale == 'number'
          ? observationSet.spo2_scale
          : null;

      allObsIncludingSpecials.push(observationSet);
    }

    // Add any scale changes that happened after the latest observation set
    allObsIncludingSpecials = allObsIncludingSpecials.concat(
      scoreSystemHistory
    );

    return allObsIncludingSpecials;
  }

  get pageCount(): number {
    return this.pages.length;
  }
}