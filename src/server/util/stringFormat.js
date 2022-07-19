function wordTrim(value, length, overflowSuffix = '…') {
    if (value.length <= length) return value;
    value = value.substr(0, length -1).trim();
    return value + overflowSuffix;
}

module.exports = {wordTrim};