package org.holapolitica.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Edge-to-edge handling. Targeting API 35+ makes Android 15+ draw the app
     * under the status and navigation bars, with no opt-out from API 36. The
     * Android WebView doesn't reliably expose those insets to CSS, so the site
     * would slide under the bars. Instead we draw edge-to-edge on every
     * Android version (same behaviour everywhere), keep the WebView clear of
     * the bars and the keyboard with margins, and let the paper-coloured
     * layout background (activity_main.xml) show behind the bars.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        // Dark icons: the site has a light paper background and no dark mode.
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(true);
        bars.setAppearanceLightNavigationBars(true);

        View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
            lp.leftMargin = sys.left;
            lp.topMargin = sys.top;
            lp.rightMargin = sys.right;
            lp.bottomMargin = Math.max(sys.bottom, ime.bottom);
            v.setLayoutParams(lp);
            // Consumed: the page's own env(safe-area-inset-*) stays 0, so the
            // web layout doesn't add the same space a second time.
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
