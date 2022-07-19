import * as json from './jsonTypes';
import {
  MonitoringInstruction,
  News2SeverityInterval,
  NurseConcern,
  ObservationJson,
  ObservationPair,
  ObservationSetJson,
  ScoreSystemHistoryJson
} from './jsonTypes';
import {
  isSpecialValue,
  MISSING,
  NO_READINGS_FOR_24_HOURS,
  REFUSED,
  SCORE_SYSTEM_CHANGE,
  SpecialValue
} from '../util/symbols';

const { formatDDMMMYY, format24hour } = require('../util/dateTimeFormats.js');

const SEVERITY_MAP: { [k: string]: keyof News2SeverityInterval } = {
  routine_monitoring: 'zero_severity_interval_hours',
  low_monitoring: 'low_severity_interval_hours',
  low_medium_monitoring: 'low_medium_severity_interval_hours',
  medium_monitoring: 'medium_severity_interval_hours',
  high_monitoring: 'high_severity_interval_hours'
};

// Clean up nurse concerns for mapping so that minor changes to spelling don't break lookup.
function canonical_nurse_concern(nurse_concern: string): string {
  return nurse_concern
    .replace(/ or /gi, ' ')
    .replace(/(?:\W*)(\w+)(?:\W+)/g, '$1_')
    .replace(/_$/, '')
    .toLowerCase();
}

export class ObservationSetBase {
  specialType: SpecialValue | string;
  systolic_blood_pressure: SpecialValue | ObservationJson;
  diastolic_blood_pressure: SpecialValue | ObservationJson;
  temperature: SpecialValue | ObservationJson;
  consciousness_acvpu: SpecialValue | ObservationJson;
  spo2: SpecialValue | ObservationJson;
  respiratory_rate: SpecialValue | ObservationJson;
  heart_rate: SpecialValue | ObservationJson;
  o2_therapy_status: SpecialValue | ObservationJson;
  nurse_concern: SpecialValue | ObservationJson;
  score_system: string;
  spo2_scale: SpecialValue | number | null;
  record_time: Date | null = null;
  scoreValue: number | null = null;
  scoreSeverity: string | null = null;
  initials: string = '';
  monitoring_instruction: MonitoringInstruction | '' = '';

  constructor(
    defaultValue: SpecialValue,
    public oxygen_masks: json.OxygenMask[]
  ) {
    this.specialType = defaultValue;
    this.systolic_blood_pressure = defaultValue;
    this.diastolic_blood_pressure = defaultValue;
    this.temperature = defaultValue;
    this.consciousness_acvpu = defaultValue;
    this.spo2 = defaultValue;
    this.respiratory_rate = defaultValue;
    this.heart_rate = defaultValue;
    this.o2_therapy_status = defaultValue;
    this.nurse_concern = defaultValue;
    this.spo2_scale = null;
    this.score_system = '';
  }

  get date(): SpecialValue | string | null {
    if (this.record_time) {
      return formatDDMMMYY(this.record_time);
    }
    return null;
  }

  get time(): SpecialValue | string | null {
    if (this.record_time) {
      return format24hour(this.record_time);
    }
    return null;
  }

  get topSection(): string {
    return '';
  }

  get bp(): [SpecialValue | number, SpecialValue | number] {
    const systolic = isSpecialValue(this.systolic_blood_pressure)
      ? this.systolic_blood_pressure
      : this.systolic_blood_pressure.observation_value == null
      ? MISSING
      : this.systolic_blood_pressure.observation_value;
    const diastolic = isSpecialValue(this.diastolic_blood_pressure)
      ? this.diastolic_blood_pressure
      : this.diastolic_blood_pressure.observation_value === null
      ? MISSING
      : this.diastolic_blood_pressure.observation_value;

    return [systolic, diastolic];
  }

  get bloodPressure(): ObservationPair {
    return {
      high: this.systolic_blood_pressure,
      low: this.diastolic_blood_pressure
    };
  }

  get diastolicBloodPressure(): SpecialValue | number {
    const bp = isSpecialValue(this.diastolic_blood_pressure)
    ? this.diastolic_blood_pressure
    : this.diastolic_blood_pressure.observation_value ?? MISSING;
    return bp;
  }

  get systolicBloodPressure(): SpecialValue | number {
    const bp = isSpecialValue(this.systolic_blood_pressure)
    ? this.systolic_blood_pressure
    : this.systolic_blood_pressure.observation_value ?? MISSING;
    return bp;
  }

  get spo2_scale_1(): ObservationJson | SpecialValue {
    if (this.spo2_scale == 1) {
      return this.spo2;
    }
    return MISSING;
  }

  get spo2_scale_2_air(): ObservationJson | SpecialValue {
    if (this.spo2_scale == 2 && !this.isOxygen) {
      return this.spo2;
    }
    return MISSING;
  }

  get spo2_scale_2_o2(): ObservationJson | SpecialValue {
    if (this.spo2_scale == 2 && this.isOxygen) {
      return this.spo2;
    }
    return MISSING;
  }

  get air(): SpecialValue | string {
    if (isSpecialValue(this.o2_therapy_status)) {
      return this.o2_therapy_status;
    }
    if (this.o2_therapy_status.observation_value == 0) {
      return 'A';
    }
    return '';
  }

  get o2PerMin(): SpecialValue | string {
    if (isSpecialValue(this.o2_therapy_status)) return this.o2_therapy_status;

    const observationValue = this.o2_therapy_status.observation_value;
    if (observationValue !== null && observationValue !== 0) {
      return observationValue.toString();
    }
    return '';
  }

  get o2Device(): string {
    const o2TherapyStatus = this.o2_therapy_status;
    if (
      !isSpecialValue(o2TherapyStatus) &&
      o2TherapyStatus.observation_metadata !== null
    ) {
      let metadata = o2TherapyStatus.observation_metadata;
      let mask = metadata.mask || 'unknown';
      let mapped_mask = this.oxygen_masks.find(
        m => m.name.toLowerCase() === mask.toLowerCase()
      );
      if (mapped_mask) {
        let mask_percent = metadata.mask_percent;
        // HIF doesn't always have a percentage set in data
        // so default to 21%.
        if (mask_percent == null) mask_percent = 21;
        let code = mapped_mask.code;
        return code.replace('{mask_percent}', mask_percent.toString());
      }
      return mask;
    }
    return '';
  }

  get isOxygen(): boolean {
    const mask = this.o2Device;
    return mask ? mask != 'RA' : false;
  }

  get acvpu(): ObservationJson | SpecialValue {
    return this.consciousness_acvpu;
  }

  get ewsTotal(): ObservationJson {
    const emptyObservation: ObservationJson = {
      measured_time: '',
      observation_metadata: null,
      observation_string: '',
      observation_type: 'spo2',
      observation_unit: '',
      observation_value: null,
      patient_refused: null,
      score_value: null,
      uuid: null
    };
    if (this.scoreValue != null) {
      return {
        ...emptyObservation,
        observation_string: this.scoreValue.toString(),
        observation_value: (this.scoreSeverity as unknown) as number
      };
    }
    return emptyObservation;
  }

  get escalationOfCare(): string {
    return this.monitoring_instruction;
  }

  get nurseConcern(): string {
    return '';
  }
}

export class ScoreSystemChange extends ObservationSetBase {
  constructor(scoreSystemChange: ScoreSystemHistoryJson) {
    super(SCORE_SYSTEM_CHANGE, []);

    if (scoreSystemChange.changed_time) {
      this.record_time = new Date(scoreSystemChange.changed_time);
    }
    this.score_system = scoreSystemChange.score_system;
    this.spo2_scale = scoreSystemChange.spo2_scale;

    const changedBy = scoreSystemChange.changed_by;
    if (changedBy) {
      const first = changedBy.first_name || '';
      const last = changedBy.last_name || '';
      this.initials = first.charAt(0) + last.charAt(0);
    } else {
      this.initials = '';
    }
  }
  get date(): SpecialValue | string | null {
    let d = super.date;
    return d !== null ? d : '';
  }

  get time(): SpecialValue | string | null {
    let t = super.time;
    return t !== null ? t : '';
  }
}

export class MissedObservations extends ObservationSetBase {
  constructor(spo2Scale: number | null) {
    super(NO_READINGS_FOR_24_HOURS, []);
    this.spo2_scale = spo2Scale;
  }

  get date(): NO_READINGS_FOR_24_HOURS {
    return NO_READINGS_FOR_24_HOURS;
  }

  get time(): NO_READINGS_FOR_24_HOURS {
    return NO_READINGS_FOR_24_HOURS;
  }
}

export class ObservationSet extends ObservationSetBase {
  private readonly obs: ObservationSetJson;
  public readonly monitoringFrequency: number | '';
  private readonly concern_table: NurseConcern[];

  constructor(obsSet: ObservationSetJson, send_config: json.SendConfig) {
    super(MISSING, send_config.oxygen_masks);

    for (let observation of obsSet.observations) {
      let type = observation.observation_type;

      if (this.hasOwnProperty(type)) {
        if (observation.patient_refused) {
          this[type] = REFUSED;
        } else {
          this[type] = observation;
        }
      }
    }
    this.obs = obsSet;
    this.score_system = obsSet.score_system;
    this.spo2_scale = obsSet.spo2_scale;
    this.record_time = obsSet.record_time ? new Date(obsSet.record_time) : null;
    this.scoreValue = obsSet.score_value;
    this.scoreSeverity = obsSet.score_severity;
    this.monitoring_instruction = obsSet.monitoring_instruction || '';
    const severity = SEVERITY_MAP[this.monitoring_instruction];
    this.monitoringFrequency =
      severity !== undefined && send_config.news2.hasOwnProperty(severity)
        ? send_config.news2[severity]
        : '';
    if (obsSet.created_by) {
      const first = obsSet.created_by.first_name || '';
      const last = obsSet.created_by.last_name || '';
      this.initials = first.charAt(0) + last.charAt(0);
    }

    this.concern_table = send_config.nurse_concern;
  }

  get nurseConcern(): string {
    // Minor spelling differences shouldn't affect the lookup table.
    const nurseConcern = this.nurse_concern;
    if (!isSpecialValue(nurseConcern)) {
      let concern = canonical_nurse_concern(nurseConcern.observation_string);
      let matched = this.concern_table.find(
        element => canonical_nurse_concern(element.name) === concern
      );
      if (matched !== undefined) {
        return matched.code;
      }
      if (nurseConcern.observation_string.indexOf(',') !== -1) {
        let concern_names =  nurseConcern.observation_string.split(",");
        let concerns: string[] = [];
        concern_names.forEach(name => {
          concern = canonical_nurse_concern(name);
          matched = this.concern_table.find(
            element => canonical_nurse_concern(element.name) === concern
          );
          if (matched===undefined) {
            concerns.push('?');
          } else {
            concerns.push(matched.code);
          }

        });
        return concerns.join(', ');
      }
      return '?';
    }
    return '';
  }

}
