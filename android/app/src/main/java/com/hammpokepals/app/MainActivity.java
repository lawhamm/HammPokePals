package com.hammpokepals.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup.LayoutParams;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * POKEPALS Android wrapper. A thin WebView that points at your POKEPALS server
 * (the "Players (LAN)" address the desktop app prints). On first launch it asks
 * for the address and remembers it; if the server can't be reached it returns to
 * the address screen so you can correct it.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "pokepals";
    private static final String KEY_URL = "serverUrl";
    private static final int GBC_BG = 0xFFC7D29B;
    private static final int GBC_INK = 0xFF20331A;

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String url = prefs().getString(KEY_URL, null);
        if (url == null || url.isEmpty()) {
            showSetup(null);
        } else {
            showWeb(url);
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }

    private void showSetup(String message) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(GBC_BG);
        root.setPadding(dp(20), dp(48), dp(20), dp(20));

        TextView title = new TextView(this);
        title.setText("POKEPALS");
        title.setTextColor(GBC_INK);
        title.setTextSize(28);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView help = new TextView(this);
        help.setText("\nEnter your POKEPALS server address.\nIt is shown in the desktop terminal as\n\"Players (LAN)\", for example:\n\nhttp://192.168.1.20:3000\n");
        help.setTextColor(GBC_INK);
        root.addView(help);

        if (message != null) {
            TextView warn = new TextView(this);
            warn.setText(message + "\n");
            warn.setTextColor(0xFF9A4226);
            root.addView(warn);
        }

        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("http://192.168.1.20:3000");
        input.setTextColor(GBC_INK);
        String existing = prefs().getString(KEY_URL, "http://");
        input.setText(existing);
        root.addView(input);

        Button connect = new Button(this);
        connect.setText("CONNECT");
        root.addView(connect, new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
        connect.setOnClickListener(v -> {
            String u = input.getText().toString().trim();
            if (u.isEmpty() || u.equals("http://") || u.equals("https://")) {
                Toast.makeText(this, "Enter a server address", Toast.LENGTH_SHORT).show();
                return;
            }
            if (!u.startsWith("http://") && !u.startsWith("https://")) {
                u = "http://" + u;
            }
            prefs().edit().putString(KEY_URL, u).apply();
            showWeb(u);
        });

        setContentView(root);
    }

    private void showWeb(String url) {
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(false);
        web.setBackgroundColor(GBC_BG);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    prefs().edit().remove(KEY_URL).apply();
                    showSetup("Couldn't reach that address. Is the server running and on the same wifi?");
                }
            }
        });
        setContentView(web);
        web.loadUrl(url);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
