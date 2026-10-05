package app.ayrovi.mobile;

import android.content.Context;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** App-private, backup-excluded IPC storage. No credentials in Intent extras.
 * Every API request reads current state; logout invalidates both processes. */
final class NativeSession {
  static AtomicFile file(Context c) { return new AtomicFile(new File(c.getNoBackupFilesDir(), "native-session")); }
  static String read(Context c) {
    try { return new String(file(c).readFully(), StandardCharsets.UTF_8); }
    catch (Exception e) { return ""; }
  }
  static void write(Context c, String token) {
    AtomicFile f = file(c);
    FileOutputStream stream = null;
    try {
      stream = f.startWrite();
      stream.write((token == null ? "" : token).getBytes(StandardCharsets.UTF_8));
      f.finishWrite(stream);
    } catch (Exception e) { if (stream != null) f.failWrite(stream); }
  }
  static File clearMarker(Context c) { return new File(c.getNoBackupFilesDir(), "merchant-clear-pending"); }
  static void logout(Context c) {
    write(c, "");
    try { clearMarker(c).createNewFile(); } catch (Exception ignored) { }
  }
}
