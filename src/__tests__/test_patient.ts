import {EncounterJson, LocationJson, PatientJson} from "../server/models/jsonTypes";
import {PatientModel} from "../server/models/patient";

var fs = require('fs');

const sendConfig = {
    "news2": {
        "zero_severity_interval_hours": 1,
        "low_severity_interval_hours": 2,
        "low_medium_severity_interval_hours": 3,
        "medium_severity_interval_hours": 4,
        "high_severity_interval_hours": 5,
        "escalation_policy": {
            "routine_monitoring": "routine monitoring",
            "low_monitoring": "low monitoring",
            "low_medium_monitoring": "low medium monitoring",
            "medium_monitoring": "medium monitoring",
            "high_monitoring": "high monitoring"
        },
    },
    "bcp": {
        "zero_severity_interval": "zero overridden",
        "high_severity_interval": "high overridden",

        "routine_monitoring": "routine monitoring overridden",
        "high_monitoring": "high monitoring overridden"
    },

    "nurse_concern": [],
    "oxygen_masks": [
        {"code": "RA", "name": "Room Air"},
        {"code": "V{mask_percent}", "name": "Venturi"},
        {"code": "H{mask_percent}", "name": "Humidified"},
        {"code": "HIF{mask_percent}", "name": "High Flow"},
        {"code": "N", "name": "Nasal cann."},
        {"code": "SM", "name": "Simple"},
        {"code": "RM", "name": "Resv mask"},
        {"code": "TM", "name": "Trach."},
        {"code": "CP", "name": "CPAP"},
        {"code": "NIV", "name": "NIV"},
        {"code": "OPT", "name": "Optiflow"},
        {"code": "NM", "name": "Nebuliser"}
    ]
};

describe('extracting fields', () => {
    let patient: PatientModel, patientJson: PatientJson, encounterJson: EncounterJson, locationJson: LocationJson;
    const RealDate: DateConstructor = Date;

    function mockDate(isoDate: string): void {
        global.Date = class extends RealDate {
            constructor() {
                super();
                return new RealDate(isoDate);
            }
        } as DateConstructor;
    }

    beforeEach((): void => {
        patientJson = JSON.parse(fs.readFileSync('src/__tests__/sample_patient.json', 'utf8'));
        encounterJson = JSON.parse(fs.readFileSync('src/__tests__/sample_encounter.json', 'utf8'));
        locationJson = JSON.parse(fs.readFileSync('src/__tests__/sample_location.json', 'utf8'));
        patient = new PatientModel(patientJson, encounterJson, locationJson, sendConfig, "TRUST");
    });

    afterEach((): void => {
        global.Date = RealDate;
    });

    test('can access formatted name', (): void => {
        expect(patient.fullName).toBe('BONO THE THIRD OF THE UNITED STATES OF AMERICA, Nicole Herzavon…');
    });

    test('can access formatted long name', (): void => {
        expect(patient.fullNameLong).toBe('BONO THE THIRD OF THE UNITED STATES OF AMERICA, Nicole Herzavonia Elikolani Valiente Junior Emmy Osca…');
    });

    it.each`first_name | last_name | truncated | full
    ${"Longer"} | ${"Longy Mc Long Name-Na-Lu-Lu-Lu-Lu-Lu-Lu-Lu-Lu Fishingberg Really Is My Name"} | ${"LONGY MC LONG NAME-NA-LU-LU-LU-LU-LU-LU-LU-LU FISHINGBERG REALL…"} | ${"LONGY MC LONG NAME-NA-LU-LU-LU-LU-LU-LU-LU-LU FISHINGBERG REALLY IS MY NAME, Longer"}
    ${"Shorty"} | ${"Shorts"} | ${"SHORTS, Shorty"} | ${"SHORTS, Shorty"}
    `('has gender', ({first_name, last_name, truncated, full}) => {
        patient.patient.first_name = first_name;
        patient.patient.last_name = last_name;
        expect(patient.fullName).toBe(truncated);
        expect(patient.fullNameLong).toBe(full);
    });


    it.each`snomed | short | full
    ${"248153007"} | ${"M"} | ${"Male"}
    ${"248152002"} | ${"F"} | ${"Female"}
    ${"32570681000036106"} | ${"I"} | ${"Indeterminate"}
    ${"184115007"} | ${"U"} | ${"Unknown"}`('has gender', ({snomed, short, full}) => {
        patient.patient.sex = snomed;
        expect(patient.gender).toBe(full);
        expect(patient.shortGender).toBe(short);
    });

    test('has name with gender', (): void => {
        expect(patient.nameWithGender).toBe('BONO THE THIRD OF THE UNITED STATES OF AMERICA, Nicole Herzavon… (I)');
    });

    test('has date of birth', (): void => {
        expect(patient.dob).toBe('1 Jul 1985');
    });

    test('has date of birth with age', (): void => {
        mockDate('2019-02-28T16:15:00z');
        expect(patient.dobWithAge).toBe('1 Jul 1985 (33y)');
    });

    test('has date of birth on birthday', (): void => {
        mockDate('2019-07-01T16:15:00z');
        expect(patient.dobWithAge).toBe('1 Jul 1985 (34y)');
    });

    test('handles missing date of birth', (): void => {
        const patientJson = JSON.parse(fs.readFileSync('src/__tests__/sample_patient.json', 'utf8'));
        patientJson["dob"] = null;
        patient = new PatientModel(patientJson, encounterJson, locationJson, sendConfig);
        expect(patient.dob).toBe("");
        expect(patient.age).toBe("");
        expect(patient.dobWithAge).toBe("");
    });


    test('has hospital number', (): void => {
        expect(patient.hospital_number).toBe('27988932');
    });

    test('has nhs number', (): void => {
        expect(patient.nhs_number).toBe('999 167 7789');
    });
    test('handles missing nhs number', (): void => {
        delete patient.patient.nhs_number;
        expect(patient.nhs_number).toBe('');
    });
    test('has admission date', (): void => {
        expect(patient.admissionDate).toBe('25 Jan 2019');
    });
    test('has ward', (): void => {
        expect(patient.ward).toBe('Sequoia Unit');
    });

    test('returns path to default logo', (): void => {
        expect(patient.svgLogo).toBe("config/logos/DEFAULT.svg");
    });

    test('returns path to trust logo', (): void => {
        patient = new PatientModel(patientJson, encounterJson, locationJson, sendConfig, "DEV");
        expect(patient.svgLogo).toBe("config/logos/DEV.svg");
    });

    it.each`property | severityText
    ${"zeroSeverityInterval"} | ${"zero overridden"}
    ${"lowSeverityInterval"} | ${"2"}
    ${"lowMediumSeverityInterval"} | ${"3"}
    ${"mediumSeverityInterval"} | ${"4"}
    ${"highSeverityInterval"} | ${"high overridden"}
    ${"routineMonitoring"} | ${"routine monitoring overridden"}
    ${"lowMonitoring"} | ${"low monitoring"}
    ${"lowMediumMonitoring"} | ${"low medium monitoring"}
    ${"mediumMonitoring"} | ${"medium monitoring"}
    ${"highMonitoring"} | ${"high monitoring overridden"}`('Escalation text $property is $severityText',
        ({property, severityText}) => {
            expect(patient.getField(property)).toBe(severityText);
        });
});
