# iOS app and widgets, first build — 2026-10-09

On the owner's direction a native iOS app was started: a shell around the
host's own web interface, four widgets (Focus, Dziś, Licznik with a step
button, Agent) and dictation to the agent that sends only on a tap. It needed
no server change. It passed its checks in a simulator against a real daemon
and a first build was uploaded to TestFlight for internal testing; nothing ran
on a physical phone.

The apps are closed source since 2026-10-10
([scope](SCOPE.md#apps-are-closed-source--owner-direction-2026-10-10)). The
full report of this build, with its checks, signing and open points, is kept
with the app's code in the private repository of the apps.
