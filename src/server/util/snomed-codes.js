// snomedCodes.js
const t = require("../translate.js");

// Snomed Codes
// =============

// https://termbrowser.nhs.uk/?perspective=full&conceptId1=74964007&edition=uk-edition&release=v20171001&server=https://termbrowser.nhs.uk/sct-browser-api/snomed&langRefset=999001261000000100,999000691000001104

// MAX DRAYSON CODE No -->> 'D0000034'
// i.e. next drayson code uses the above incremented by one
// THIS MUST BE SAME FOR ALL SENSYNE HEALTH PRODUCTS

const SnomedCodes = {
  sex: {
    male: {
      name: t("snomed.male"),
      value: "248153007",
    },
    female: {
      name: t("snomed.female"),
      value: "248152002",
    },
    indeterminate: {
      name: t("snomed.indeterminate"),
      value: "32570681000036106",
    },
    unknown: {
      name: t("snomed.unknown"),
      value: "184115007",
    },
  },

  diagnoses: {
    spo2: "431314004", // 431314004 | Peripheral oxygen saturation (observable entity)
  },

  locationType: {
    hospital: {
      name: t("snomed.hospital"),
      value: "22232009",
    },
    ward: {
      name: t("snomed.ward"),
      value: "225746001",
    },
  },
};

module.exports = SnomedCodes;
