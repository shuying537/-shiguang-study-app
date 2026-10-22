package com.shiguang.study;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean backInFlight;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (backInFlight) return;
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView == null) {
                    systemBack(this);
                    return;
                }
                backInFlight = true;
                webView.evaluateJavascript(
                    "(function(){try{return typeof window.__studyBack==='function' && window.__studyBack()===true;}catch(e){return false;}})()",
                    handled -> {
                        backInFlight = false;
                        if (!"true".equals(handled)) systemBack(this);
                    }
                );
            }
        });
    }

    private void systemBack(OnBackPressedCallback callback) {
        callback.setEnabled(false);
        try {
            getOnBackPressedDispatcher().onBackPressed();
        } finally {
            callback.setEnabled(true);
        }
    }
}
