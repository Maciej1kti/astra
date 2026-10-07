// Host list parsing for the Astra bar widget. Plain functions only: the shell
// imports this file from QML and the unit test loads it in Node.

var DEFAULT_PORT = 47832
var MAX_HOSTS = 20
var HOST_PATTERN = "([A-Za-z0-9](?:[A-Za-z0-9.-]{0,252}[A-Za-z0-9])?|\\[[0-9A-Fa-f:]{2,45}\\])"
var URL_FORM = new RegExp("^https://" + HOST_PATTERN + "(?::([0-9]{1,5}))?/?$", "i")
var BARE_FORM = new RegExp("^" + HOST_PATTERN + "(?::([0-9]{1,5}))?$")
var NAME_FORM = /^[^\s,=\/]{1,40}$/

// One entry is `address` or `name=address`. An address is a bare host or IP,
// `host:port`, or a complete `https://` origin. A bare address gets the manual
// test host's HTTPS port; an explicit origin is kept as written.
function parseEntry(text) {
  var entry = String(text).trim()
  var name = ""
  var split = entry.indexOf("=")
  if (split > 0) {
    name = entry.slice(0, split).trim()
    entry = entry.slice(split + 1).trim()
    if (!NAME_FORM.test(name)) return null
  }
  var explicit = URL_FORM.exec(entry)
  var match = explicit || BARE_FORM.exec(entry)
  if (!match) return null
  var port = match[2] ? Number(match[2]) : (explicit ? 443 : DEFAULT_PORT)
  if (port < 1 || port > 65535) return null
  var host = match[1].toLowerCase()
  return {
    name: name || host,
    host: host,
    url: "https://" + host + (port === 443 ? "" : ":" + port)
  }
}

// Entries are separated by commas or whitespace. Invalid entries and repeated
// origins are dropped, so a pasted list never yields two rows for one host.
function parseHosts(text) {
  var parts = String(text === undefined || text === null ? "" : text).split(/[\s,]+/)
  var hosts = []
  var seen = {}
  for (var i = 0; i < parts.length && hosts.length < MAX_HOSTS; i++) {
    if (parts[i] === "") continue
    var host = parseEntry(parts[i])
    if (!host || seen[host.url]) continue
    seen[host.url] = true
    hosts.push(host)
  }
  return hosts
}

function formatHosts(hosts) {
  var parts = []
  for (var i = 0; i < hosts.length; i++)
    parts.push(hosts[i].name === hosts[i].host ? hosts[i].url : hosts[i].name + "=" + hosts[i].url)
  return parts.join(", ")
}

// The selected host is stored by origin. A missing or removed selection falls
// back to the first host.
function activeIndex(hosts, activeUrl) {
  for (var i = 0; i < hosts.length; i++)
    if (hosts[i].url === activeUrl) return i
  return hosts.length > 0 ? 0 : -1
}
