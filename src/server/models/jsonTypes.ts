import { SpecialValue } from '../util/symbols';

export interface OxygenMask {
  code: string;
  name: string;
}

export interface NurseConcern {
  code: string;
  name: string;
  text: string;
}

export interface News2SeverityInterval {
  zero_severity_interval_hours: number;
  low_severity_interval_hours: number;
  low_medium_severity_interval_hours: number;
  medium_severity_interval_hours: number;
  high_severity_interval_hours: number;
}

export interface News2Config extends News2SeverityInterval {
  escalation_policy: {
    routine_monitoring: string;
    low_monitoring: string;
    low_medium_monitoring: string;
    medium_monitoring: string;
    high_monitoring: string;
  };
}

export interface SendConfig {
  bcp: {
    [k: string]: string | string[];
  };
  news2: News2Config;
  nurse_concern: NurseConcern[];
  oxygen_masks: OxygenMask[];
}

export type MonitoringInstruction =
  | 'routine_monitoring'
  | 'low_monitoring'
  | 'low_medium_monitoring'
  | 'medium_monitoring'
  | 'high_monitoring';

export interface ScoreSystemHistoryJson {
  changed_time: string;
  score_system: string;
  spo2_scale: number | null;
  changed_by?: {
    first_name?: string;
    last_name?: string;
  };
}

interface CreatedModified {
  created?: string;
  created_by?: {
    first_name?: string;
    last_name?: string;
    uuid?: string;
  };
  modified?: string;
  modified_by?: {
    first_name?: string;
    last_name?: string;
    uuid: string;
  };
}

export interface ObservationMetadataJson extends CreatedModified {
  gcs_eyes: string | null;
  gcs_motor: string | null;
  mask: string | null;
  mask_percent: number | null;
  patient_position: string | null;
  uuid: string | null;
}

export interface ObservationJson extends CreatedModified {
  measured_time: string;
  observation_metadata: ObservationMetadataJson | null;
  observation_string: string;
  observation_type: 'spo2';
  observation_unit: string;
  observation_value: number | null;
  patient_refused: null;
  score_value: number | null;
  uuid: string | null;
}

export type ObservationReading = string | number | ObservationJson;
export interface ObservationPair {
  high: ObservationJson | SpecialValue;
  low: ObservationJson | SpecialValue;
}

export interface ObservationSetJson extends CreatedModified {
  monitoring_instruction?: MonitoringInstruction | null;
  observations: ObservationJson[];
  record_time: string;
  score_severity: string;
  score_string: string;
  score_system: string;
  score_value: number;
  spo2_scale: 1 | 2;
  time_next_obs_set_due: string;
  uuid: string;
}

export interface PatientJson extends CreatedModified {
  first_name: string;
  last_name: string;
  dob: string;
  hospital_number: string;
  sex?: string;
  nhs_number?: string;
}

export interface EncounterJson extends CreatedModified {
  admitted_at: string;
  score_system_history: ScoreSystemHistoryJson[];
  epr_encounter_id?: string;
}

export interface LocationJson extends CreatedModified {
  display_name: string;
  location_type?: string;
  parent?: LocationJson | null;
}

export interface JsonRequest {
  patient: PatientJson;
  encounter: EncounterJson;
  observation_sets: ObservationSetJson[];
  location: LocationJson;
  trustomer: { send_config: SendConfig };
  pages?: { first: number; last: number };
}
