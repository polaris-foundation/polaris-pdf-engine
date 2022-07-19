const dayMonYearFormatter = new Intl.DateTimeFormat('en-GB', {month: 'short', day: 'numeric', year: 'numeric'});
const ddMMMYYFormatter = new Intl.DateTimeFormat('en-GB', {month: 'short', day: 'numeric', year: '2-digit'});

// We should be able to just call the format method, but Alpine Linux doesn't support locales, so we would get
// US formatting if we did.
function formatDMY(date) {
  const parts = dayMonYearFormatter.formatToParts(date).reduce((map, obj) => ({[obj.type]: obj.value, ...map}), {});
  return `${parts.day} ${parts.month} ${parts.year}`;
}

function formatDayMon(date) {
  const parts = ddMMMYYFormatter.formatToParts(date).reduce((map, obj) => ({[obj.type]: obj.value, ...map}), {});
  return `${parts.day} ${parts.month}`;
}

function formatDDMMMYY(date) {
  const parts = ddMMMYYFormatter.formatToParts(date).reduce((map, obj) => ({[obj.type]: obj.value, ...map}), {});
  return `${parts.day} ${parts.month} ${parts.year}`;
}

function format24hour(time) {
  const hours = ('0' + time.getHours()).slice(-2);
  const minutes = ('0' + time.getMinutes()).slice(-2);
  return `${hours}:${minutes}`;
}

module.exports = {formatDMY, formatDayMon, formatDDMMMYY, format24hour};
