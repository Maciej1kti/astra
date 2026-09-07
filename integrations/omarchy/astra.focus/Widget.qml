import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "astra.focus"
  ipcTarget: "astra.focus"
  manageIpc: false
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  readonly property string socketPath: String(setting("socketPath", ""))
  readonly property string webUrl: String(setting("webUrl", ""))
  readonly property bool configured: socketPath.startsWith("/")
  readonly property bool validUrl: /^https:\/\/[^\s]+$/.test(webUrl)
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  property var snapshot: ({online: false, cards: [], total: 0, message: "Waiting for first check"})
  property double lastAttempt: 0
  property string checkedAt: ""

  function refresh(force) {
    if (reader.running || (!force && Date.now() - lastAttempt < 5000)) return
    lastAttempt = Date.now()
    if (!configured) {
      snapshot = {online: false, cards: [], total: 0, message: "Configure the local server socket in widget settings."}
      return
    }
    reader.command = ["python3", decodeURIComponent(Qt.resolvedUrl("status.py").toString().replace(/^file:\/\//, "")), socketPath]
    reader.running = true
  }

  function launch() {
    if (!validUrl) return
    Quickshell.execDetached(["omarchy", "launch", "webapp", webUrl])
    close()
  }

  function updateHover() {
    if (button.tooltipHovered || popup.containsMouse) {
      hideDelay.stop()
      if (!opened) showDelay.restart()
    } else {
      showDelay.stop()
      hideDelay.restart()
    }
  }

  onOpenedChanged: if (opened) refresh(false)
  onSocketPathChanged: {
    snapshot = {online: false, cards: [], total: 0, message: "Waiting for first check"}
    if (reader.running) reader.running = false
    Qt.callLater(function() { refresh(true) })
  }
  Component.onCompleted: refresh(true)

  Timer { id: showDelay; interval: 250; onTriggered: root.open() }
  Timer {
    id: hideDelay
    interval: 450
    onTriggered: if (!button.tooltipHovered && !popup.containsMouse) root.close()
  }
  Timer {
    interval: root.opened ? 15000 : 60000
    running: true
    repeat: true
    onTriggered: root.refresh(false)
  }
  Timer {
    interval: 8000
    running: reader.running
    onTriggered: {
      reader.running = false
      root.snapshot = {online: false, cards: [], total: 0, message: "Server check timed out"}
    }
  }
  Process {
    id: reader
    stdout: StdioCollector {
      onStreamFinished: {
        if (reader.command[2] !== root.socketPath) return
        try {
          var value = JSON.parse(text)
          if (typeof value.online !== "boolean" || !Array.isArray(value.cards)) throw new Error("Invalid status")
          root.snapshot = value
          root.checkedAt = Qt.formatDateTime(new Date(), "HH:mm:ss")
        } catch (error) {
          root.snapshot = {online: false, cards: [], total: 0, message: "Unable to read server status"}
        }
      }
    }
    onExited: function(code) {
      if (code !== 0) root.snapshot = {online: false, cards: [], total: 0, message: "Unable to run server check"}
    }
  }
  IpcHandler {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): void { root.refresh(true) }
    function launchUI(): void { root.launch() }
    function status(): string { return JSON.stringify({opened: root.opened, online: root.snapshot.online, total: root.snapshot.total, cardsShown: root.snapshot.cards.length, unavailable: root.snapshot.cards.filter(function(card) { return !card.available }).length, checkedAt: root.checkedAt, busy: reader.running}) }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "✦"
    tooltipText: ""
    onTooltipHoveredChanged: root.updateHover()
    onPressed: function(code) {
      if (code === Qt.LeftButton) root.launch()
      else if (code === Qt.MiddleButton) root.refresh(true)
      else root.toggle()
    }
    Rectangle {
      width: Style.space(5)
      height: width
      radius: width / 2
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      anchors.rightMargin: Style.space(2)
      anchors.bottomMargin: Style.space(4)
      color: root.snapshot.online ? Color.accent : Color.urgent
    }
  }

  PopupCard {
    id: popup
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    triggerMode: "hover"
    contentWidth: fittedContentWidth(Style.space(350))
    contentHeight: fittedContentHeight(content.implicitHeight)
    onContainsMouseChanged: root.updateHover()

    Column {
      id: content
      width: parent.width
      spacing: Style.space(12)
      Text {
        text: "Astra"
        textFormat: Text.PlainText
        color: root.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.heading
        font.bold: true
      }
      Text {
        width: parent.width
        text: reader.running ? "Checking server…" : (root.snapshot.online ? "●  Server reachable" : "●  Server unavailable")
        textFormat: Text.PlainText
        color: root.snapshot.online ? Color.accent : Color.urgent
        font.family: Style.font.family
        font.pixelSize: Style.font.body
      }
      PanelSeparator { width: parent.width; foreground: root.foreground }
      Text {
        text: "FOCUS" + (root.snapshot.online ? "  ·  " + root.snapshot.total + " pinned" : "")
        textFormat: Text.PlainText
        color: root.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        font.bold: true
      }
      Repeater {
        model: root.snapshot.cards
        Column {
          required property var modelData
          width: content.width
          spacing: Style.space(3)
          Text {
            width: parent.width
            text: modelData.title
            textFormat: Text.PlainText
            color: root.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            wrapMode: Text.Wrap
            maximumLineCount: 2
            elide: Text.ElideRight
          }
          Text {
            text: modelData.status
            textFormat: Text.PlainText
            color: root.foreground
            opacity: 0.65
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            visible: text !== ""
          }
        }
      }
      Text {
        width: parent.width
        visible: !root.snapshot.online || root.snapshot.cards.length === 0
        text: root.snapshot.online ? "Nothing pinned yet. Choose your focus in Astra." : root.snapshot.message
        textFormat: Text.PlainText
        color: root.foreground
        opacity: 0.7
        font.family: Style.font.family
        font.pixelSize: Style.font.body
        wrapMode: Text.Wrap
      }
      Text {
        visible: root.snapshot.total > 5
        text: "+ " + (root.snapshot.total - 5) + " more in Astra"
        textFormat: Text.PlainText
        color: root.foreground
        font.pixelSize: Style.font.caption
      }
      Row {
        spacing: Style.space(8)
        Button { text: "Open Astra ↗"; enabled: root.validUrl; bordered: true; onClicked: root.launch() }
        Button { text: "Refresh"; enabled: !reader.running; onClicked: root.refresh(true) }
      }
      Text {
        width: parent.width
        text: !root.validUrl ? "Set the Astra HTTPS URL in widget settings." : (root.checkedAt ? "Last check " + root.checkedAt : "Local server · read-only preview")
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
