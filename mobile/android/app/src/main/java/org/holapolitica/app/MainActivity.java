package org.holapolitica.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Edge-to-edge handling. Targeting API 35+ makes Android 15+ draw the app
     * under the status and navigation bars, with no opt-out from API 36, and
     * the WebView's own handling of that is partial (recent WebView builds
     * map some insets to CSS env(), not reliably the gesture bar). So we draw
     * edge-to-edge on every Android version and pad the WebView's parent by
     * the bars and the keyboard. The listener sits on the parent because
     * Chromium installs its own insets listener on the WebView itself,
     * replacing any set there. The paper background shows behind the bars.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        // Dark icons: the site has a light paper background and no dark mode.
        // The theme sets the same (styles.xml) so it survives the splash.
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(true);
        bars.setAppearanceLightNavigationBars(true);

        View container = (View) getBridge().getWebView().getParent();
        container.setBackgroundColor(ContextCompat.getColor(this, R.color.paperBackground));
        ViewCompat.setOnApplyWindowInsetsListener(container, (v, insets) -> {
            Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(sys.left, sys.top, sys.right, Math.max(sys.bottom, ime.bottom));
            // Consumed: the page's env(safe-area-inset-*) stays 0, so the
            // web layout doesn't add the same space a second time.
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
