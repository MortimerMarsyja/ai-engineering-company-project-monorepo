// Pin the timezone so date-formatting tests are deterministic regardless
// of the host machine's local timezone.
process.env.TZ = "UTC";
