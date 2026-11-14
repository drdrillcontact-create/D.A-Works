package com.darecords.daworks;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "SyncFile")
public class SyncFilePlugin extends Plugin {

    private static final int MAX_SYNC_FILE_BYTES = 20 * 1024 * 1024;
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void chooseSyncFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "handleChosenFile");
    }

    @PluginMethod
    public void createSyncFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, "DA Works Sync.json");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "handleChosenFile");
    }

    @ActivityCallback
    private void handleChosenFile(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("فایل انتخاب‌شده معتبر نیست.", "INVALID_FILE");
            return;
        }

        int flags = result.getData().getFlags()
            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
        } catch (SecurityException ignored) {
            // Some document providers only grant a temporary permission; reading still works this session.
        }

        JSObject response = new JSObject();
        response.put("uri", uri.toString());
        response.put("name", getDisplayName(uri));
        response.put("cancelled", false);
        call.resolve(response);
    }

    @PluginMethod
    public void readSyncFile(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isEmpty()) {
            call.reject("شناسهٔ فایل همگام‌سازی موجود نیست.", "MISSING_URI");
            return;
        }

        ioExecutor.execute(() -> {
            try (InputStream input = getContext().getContentResolver().openInputStream(Uri.parse(uriValue));
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                if (input == null) throw new IllegalStateException("فایل Google Drive قابل خواندن نیست.");
                byte[] buffer = new byte[8192];
                int read;
                int total = 0;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_SYNC_FILE_BYTES) throw new IllegalStateException("فایل همگام‌سازی بیش از حد بزرگ است.");
                    output.write(buffer, 0, read);
                }
                JSObject response = new JSObject();
                response.put("content", output.toString(StandardCharsets.UTF_8.name()));
                call.resolve(response);
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "خواندن فایل همگام‌سازی ناموفق بود." : error.getMessage(), "READ_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void writeSyncFile(PluginCall call) {
        String uriValue = call.getString("uri");
        String content = call.getString("content");
        if (uriValue == null || uriValue.isEmpty() || content == null) {
            call.reject("اطلاعات فایل همگام‌سازی کامل نیست.", "INVALID_ARGUMENT");
            return;
        }
        if (content.getBytes(StandardCharsets.UTF_8).length > MAX_SYNC_FILE_BYTES) {
            call.reject("فایل همگام‌سازی بیش از حد بزرگ است.", "FILE_TOO_LARGE");
            return;
        }

        ioExecutor.execute(() -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(Uri.parse(uriValue), "wt")) {
                if (output == null) throw new IllegalStateException("نوشتن در فایل Google Drive ممکن نیست.");
                output.write(content.getBytes(StandardCharsets.UTF_8));
                output.flush();
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "نوشتن فایل همگام‌سازی ناموفق بود." : error.getMessage(), "WRITE_FAILED", error);
            }
        });
    }

    private String getDisplayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex >= 0) return cursor.getString(nameIndex);
            }
        } catch (Exception ignored) {
            // Fall back to the final URI path segment.
        }
        String name = uri.getLastPathSegment();
        return name == null ? "DA Works Sync.json" : name;
    }
}
