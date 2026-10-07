import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "hosts.js" as Hosts

Panel {
  id: root
  moduleName: "astra.focus"
  ipcTarget: "astra.focus"
  manageIpc: false
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  property var hosts: []
  property string activeUrl: ""
  readonly property int activeIndex: Hosts.activeIndex(hosts, activeUrl)
  readonly property var active: activeIndex >= 0 ? hosts[activeIndex] : null
  readonly property string currentUrl: active ? active.url : ""
  // "unknown" until the first answer for the selected host, then "online" or "offline".
  property string reach: "unknown"
  property string probedUrl: ""
  property double lastAttempt: 0
  property double lastWheel: 0
  property string checkedAt: ""
  property string inputError: ""
  property var pendingWrites: []
  property int pendingCount: 0

  function load() {
    if (pendingCount > 0) return
    hosts = Hosts.parseHosts(setting("hosts", ""))
    activeUrl = String(setting("activeHost", ""))
  }

  // Settings live in the user's shell.json. Writes are queued so the host list
  // and the selection never race each other.
  function save(key, value) {
    pendingWrites.push(["omarchy", "bar", "set", "astra.focus", key, JSON.stringify(value), "--json"])
    pendingCount = pendingWrites.length + (writer.running ? 1 : 0)
    pump()
  }

  function pump() {
    if (writer.running) return
    if (pendingWrites.length === 0) { pendingCount = 0; return }
    writer.command = pendingWrites.shift()
    writer.running = true
  }

  function select(url) {
    if (url === currentUrl) return
    activeUrl = url
    save("activeHost", url)
  }

  function selectNamed(text) {
    for (var i = 0; i < hosts.length; i++)
      if (hosts[i].name === text || hosts[i].url === text || hosts[i].host === text) { select(hosts[i].url); return true }
    return false
  }

  function cycle(step) {
    if (hosts.length < 2) return
    select(hosts[(activeIndex + step + hosts.length) % hosts.length].url)
  }

  function addHosts(text) {
    var parsed = Hosts.parseHosts(text)
    if (parsed.length === 0) {
      inputError = "Enter an IP or host name, host:port, or an https:// address."
      return false
    }
    var merged = hosts.slice()
    for (var i = 0; i < parsed.length; i++) {
      var known = false
      for (var j = 0; j < merged.length; j++) if (merged[j].url === parsed[i].url) known = true
      if (!known && merged.length < Hosts.MAX_HOSTS) merged.push(parsed[i])
    }
    inputError = ""
    if (merged.length !== hosts.length) {
      hosts = merged
      save("hosts", Hosts.formatHosts(merged))
    }
    select(parsed[parsed.length - 1].url)
    return true
  }

  function removeHost(url) {
    var kept = hosts.filter(function(host) { return host.url !== url })
    if (kept.length === hosts.length) return
    hosts = kept
    save("hosts", Hosts.formatHosts(kept))
    if (activeUrl === url) {
      activeUrl = kept.length > 0 ? kept[0].url : ""
      save("activeHost", activeUrl)
    }
  }

  function refresh(force) {
    if (reader.running || (!force && Date.now() - lastAttempt < 5000)) return
    if (currentUrl === "") { reach = "unknown"; return }
    lastAttempt = Date.now()
    probedUrl = currentUrl
    // Reachability only: no credentials are sent, and manual test hosts use a
    // self-signed certificate, so the probe does not verify it.
    reader.command = ["curl", "--silent", "--insecure", "--proto", "=https", "--max-redirs", "0",
                      "--max-time", "5", "--max-filesize", "4096", "--output", "/dev/null",
                      "--write-out", "%{http_code}", currentUrl + "/healthz"]
    reader.running = true
  }

  function launch() {
    if (currentUrl === "" || launcher.running) return
    launcher.command = ["python3", decodeURIComponent(Qt.resolvedUrl("launch.py").toString().replace(/^file:\/\//, "")), currentUrl]
    launcher.running = true
    close()
  }

  onSettingsChanged: load()
  onCurrentUrlChanged: {
    reach = "unknown"
    checkedAt = ""
    if (reader.running) reader.running = false
    Qt.callLater(function() { refresh(true) })
  }
  onOpenedChanged: {
    if (opened) refresh(false)
    else inputError = ""
  }
  Component.onCompleted: { load(); refresh(true) }

  Process { id: launcher }
  Process {
    id: writer
    onExited: root.pump()
  }
  Timer {
    interval: root.opened ? 15000 : 60000
    running: true
    repeat: true
    onTriggered: root.refresh(false)
  }
  Process {
    id: reader
    stdout: StdioCollector {
      onStreamFinished: {
        if (root.probedUrl !== root.currentUrl) return
        root.reach = text.trim() === "200" ? "online" : "offline"
        root.checkedAt = Qt.formatDateTime(new Date(), "HH:mm:ss")
      }
    }
  }
  IpcHandler {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): void { root.refresh(true) }
    function launchUI(): void { root.launch() }
    function add(host: string): bool { return root.addHosts(host) }
    function select(host: string): bool { return root.selectNamed(host) }
    function remove(host: string): void { root.removeHost(host) }
    function next(): void { root.cycle(1) }
    function status(): string { return JSON.stringify({opened: root.opened, hosts: root.hosts.map(function(host) { return host.url }), active: root.currentUrl, reach: root.reach, checkedAt: root.checkedAt, busy: reader.running}) }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.active ? "✦ " + root.active.name : "✦"
    active: root.reach === "offline"
    tooltipText: root.active ? root.active.url : "Add an Astra host"
    onPressed: function(code) {
      if (code === Qt.LeftButton && root.active) root.launch()
      else if (code === Qt.MiddleButton) root.refresh(true)
      else root.toggle()
    }
    onWheelMoved: function(delta) {
      if (delta === 0 || Date.now() - root.lastWheel < 250) return
      root.lastWheel = Date.now()
      root.cycle(delta < 0 ? 1 : -1)
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: field
    contentWidth: panel.fittedContentWidth(Style.space(350))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    Column {
      id: content
      width: parent.width
      spacing: Style.space(12)
      Text {
        text: "Astra hosts"
        textFormat: Text.PlainText
        color: root.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.heading
        font.bold: true
      }
      Text {
        width: parent.width
        visible: root.active !== null
        text: reader.running ? "Checking " + (root.active ? root.active.name : "") + "…"
            : (root.reach === "online" ? "●  Reachable" : (root.reach === "offline" ? "●  Unavailable" : "●  Not checked yet"))
        textFormat: Text.PlainText
        color: root.reach === "offline" ? Color.urgent : (root.reach === "online" ? Color.accent : root.foreground)
        font.family: Style.font.family
        font.pixelSize: Style.font.body
      }
      PanelSeparator { width: parent.width; foreground: root.foreground }
      Repeater {
        model: root.hosts
        Row {
          id: hostRow
          required property var modelData
          width: content.width
          spacing: Style.space(6)
          Button {
            width: hostRow.width - removeButton.width - hostRow.spacing
            leftAlign: true
            foreground: root.foreground
            selected: hostRow.modelData.url === root.currentUrl
            text: hostRow.modelData.name === hostRow.modelData.host
                ? hostRow.modelData.url.replace(/^https:\/\//, "")
                : hostRow.modelData.name + "  ·  " + hostRow.modelData.url.replace(/^https:\/\//, "")
            onClicked: root.select(hostRow.modelData.url)
          }
          Button {
            id: removeButton
            foreground: root.foreground
            text: "✕"
            tooltipText: "Remove this host"
            onClicked: root.removeHost(hostRow.modelData.url)
          }
        }
      }
      Text {
        width: parent.width
        visible: root.hosts.length === 0
        text: "No hosts yet. Paste an address below."
        textFormat: Text.PlainText
        color: root.foreground
        opacity: 0.7
        font.family: Style.font.family
        font.pixelSize: Style.font.body
        wrapMode: Text.Wrap
      }
      Row {
        id: addRow
        width: parent.width
        spacing: Style.space(6)
        TextField {
          id: field
          width: addRow.width - addButton.width - addRow.spacing
          foreground: root.foreground
          placeholderText: "IP, host:port or https://…"
          onAccepted: if (root.addHosts(text)) text = ""
          onTextEdited: root.inputError = ""
          Keys.onEscapePressed: root.close()
        }
        Button {
          id: addButton
          foreground: root.foreground
          text: "Add"
          bordered: true
          onClicked: if (root.addHosts(field.text)) field.text = ""
        }
      }
      Text {
        width: parent.width
        visible: root.inputError !== ""
        text: root.inputError
        textFormat: Text.PlainText
        color: Color.urgent
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        wrapMode: Text.Wrap
      }
      Row {
        spacing: Style.space(8)
        Button { text: "Open Astra ↗"; foreground: root.foreground; enabled: root.active !== null; bordered: true; onClicked: root.launch() }
        Button { text: "Refresh"; foreground: root.foreground; enabled: root.active !== null && !reader.running; onClicked: root.refresh(true) }
      }
      Text {
        width: parent.width
        visible: root.active !== null
        text: root.checkedAt ? "Last check " + root.checkedAt : "Scroll the bar label to switch hosts."
        textFormat: Text.PlainText
        color: root.foreground
        opacity: 0.55
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        wrapMode: Text.Wrap
      }
    }
  }
}
