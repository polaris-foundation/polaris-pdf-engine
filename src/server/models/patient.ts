import {EncounterJson, LocationJson, NurseConcern, PatientJson, SendConfig} from "./jsonTypes";
const {wordTrim} = require('../util/stringFormat.js');
const SnomedCodes = require('../util/snomed-codes.js');
const {formatDMY} = require('../util/dateTimeFormats.js');
const fs = require('fs');

const SNOMED_MALE = SnomedCodes.sex.male.value;
const SNOMED_FEMALE = SnomedCodes.sex.female.value;
const SNOMED_INDETERMINATE = SnomedCodes.sex.indeterminate.value;
const SNOMED_WARD = SnomedCodes.locationType.ward.value;


// This model exposes the displayable fields for patient, encounter, and location.
export class PatientModel {
    public patient: PatientJson;
    private encounter: EncounterJson;
    private location: LocationJson;
    public nurse_concern: NurseConcern[];
    private _dob: Date | null;
    private _admitted_at: Date | null;
    private epr_encounter_id: string;
    public pageNumberCallback?: () => number;

    constructor(patient: PatientJson, encounter: EncounterJson, location: LocationJson, private send_config: SendConfig, private customer_code: string | null = null) {
        this.patient = patient;
        this.encounter = encounter;
        this.location = location;
        this.send_config = send_config;
        this.nurse_concern = send_config.nurse_concern.sort((a, b) => (a.code.localeCompare(b.code)));

        this._dob = this.patient && this.patient.dob ? new Date(this.patient.dob) : null;
        this._admitted_at = this.encounter && this.encounter.admitted_at ?
            new Date(this.encounter.admitted_at) : null;
        this.epr_encounter_id = encounter.epr_encounter_id || '';
    }

    public getField(name: string): string {
        const value = this[name as keyof PatientModel];
        if (typeof value == "string") {
            return value;
        }
        return '';
    }

    private getBcpOverride(name: string): string {
        // bcp may contain other non-string properties, they are not extractable by this method.
        if (this.send_config.hasOwnProperty('bcp') && name in this.send_config.bcp) {
            const value = this.send_config.bcp[name];
            if (typeof value == "string") return value;
        }
        return '';
    }

    get fullNameLong(): String {
        return wordTrim(`${this.patient.last_name.toUpperCase()}, ${this.patient.first_name}`, 102);
    }

    get fullName(): String {
        return wordTrim(`${this.patient.last_name.toUpperCase()}, ${this.patient.first_name}`, 64);       
    }

    get gender(): string {
        // Field naming mismatch: we actually display sex, but the label on the page says 'Gender'
        // so we'll call it that for the purposes of keeping the config simple.

        switch (this.patient.sex) {
            case SNOMED_MALE:
                return 'Male';
            case SNOMED_FEMALE:
                return 'Female';
            case SNOMED_INDETERMINATE:
                return 'Indeterminate';
            default:
                return 'Unknown';
        }
    }

    get shortGender(): string {
        switch (this.patient.sex) {
            case SNOMED_MALE:
                return 'M';
            case SNOMED_FEMALE:
                return 'F';
            case SNOMED_INDETERMINATE:
                return 'I';
            default:
                return 'U';
        }

    }

    get nameWithGender(): string {
        return `${this.fullName} (${this.shortGender})`;
    }

    get dob(): string {
        const dob = this._dob;
        if (dob === null) {
            return '';
        }
        return formatDMY(dob);
    }

    get age(): string {
        const today = new Date();
        const birthDate = this._dob;
        if (birthDate === null) {
            return '';
        }
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age.toString();
    }

    get dobWithAge(): string {
        if (this._dob === null) {
            return '';
        }
        return `${this.dob} (${this.age}y)`;
    }

    get hospital_number(): string {
        return this.patient.hospital_number;
    }

    get nhs_number(): string {
        if (!this.patient.nhs_number) return '';
        return this.patient.nhs_number.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
    }

    get admissionDate(): string {
        if (this._admitted_at !== null) {
            return formatDMY(this._admitted_at);
        }
        return '';
    }

    get ward(): string {
        let location = this.location;
        while (location && location.location_type !== SNOMED_WARD && location.parent) {
            location = location.parent;
        }
        if (!location) {
            return '';
        }
        return location.display_name;
    }

    get pageNumber(): string {
        const pageNo = this.pageNumberCallback ? this.pageNumberCallback() : 0;
        return pageNo.toString();
    }

    get pageDate(): string {
        const localDate = new Date();
        const dateWithTimezone = localDate.toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
        const timeWithTimezone = localDate.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute:'2-digit'});
        const created_at =  "Document created on " + dateWithTimezone + " at " + timeWithTimezone;
        return created_at;
    }

    get routineMonitoring(): string {
        return this.getBcpOverride('routine_monitoring') || this.send_config.news2.escalation_policy['routine_monitoring'];
    }

    get lowMonitoring(): string {
        return this.getBcpOverride('low_monitoring') || this.send_config.news2.escalation_policy['low_monitoring'];
    }

    get lowMediumMonitoring(): string {
        return this.getBcpOverride('low_medium_monitoring') || this.send_config.news2.escalation_policy['low_medium_monitoring'];
    }

    get mediumMonitoring(): string {
        return this.getBcpOverride('medium_monitoring') || this.send_config.news2.escalation_policy['medium_monitoring'];
    }

    get highMonitoring(): string {
        return this.getBcpOverride('high_monitoring') || this.send_config.news2.escalation_policy['high_monitoring'];
    }

    get highSeverityInterval(): string {
        return this.getBcpOverride('high_severity_interval')
            || this.send_config.news2.high_severity_interval_hours.toString();
    }

    get lowMediumSeverityInterval(): string {
        return this.getBcpOverride('low_medium_severity_interval')
            || this.send_config.news2.low_medium_severity_interval_hours.toString();
    }

    get lowSeverityInterval(): string {
        return this.getBcpOverride('low_severity_interval')
            || this.send_config.news2.low_severity_interval_hours.toString();
    }

    get mediumSeverityInterval(): string {
        return this.getBcpOverride('medium_severity_interval')
            || this.send_config.news2.medium_severity_interval_hours.toString();
    }

    get zeroSeverityInterval(): string {
        return this.getBcpOverride('zero_severity_interval')
            || this.send_config.news2.zero_severity_interval_hours.toString();
    }

    get svgLogo(): string {
        try {
            fs.readFileSync(`config/logos/${this.customer_code}.svg`)
        } catch (e) {
            return `config/logos/DEFAULT.svg`
        }
        return `config/logos/${this.customer_code}.svg`;
    }
}

module.exports = {PatientModel};
