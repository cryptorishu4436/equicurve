package app.equicurve.mobile

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var offline: View
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var lastUrl: String = START_URL

    private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileCallback
        fileCallback = null
        val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        callback?.onReceiveValue(uris)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.web)
        progress = findViewById(R.id.progress)
        offline = findViewById(R.id.offline)
        findViewById<Button>(R.id.retry).setOnClickListener {
            offline.visibility = View.GONE
            webView.loadUrl(lastUrl)
        }

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.javaScriptCanOpenWindowsAutomatically = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.userAgentString = settings.userAgentString + " " + USER_AGENT_TOKEN
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

        webView.webViewClient = ShellClient()
        webView.webChromeClient = ShellChrome()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        val restored = savedInstanceState?.getString(STATE_URL)
        webView.loadUrl(restored ?: urlFrom(intent))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val url = urlFrom(intent)
        if (url != START_URL || intent.data != null) webView.loadUrl(url)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(STATE_URL, lastUrl)
    }

    private fun urlFrom(intent: Intent?): String {
        val data = intent?.data ?: return START_URL
        val host = data.host?.lowercase()
        val scheme = data.scheme?.lowercase()
        if (host == SITE_HOST && (scheme == "https" || scheme == "http")) return data.toString()
        return START_URL
    }

    private fun staysInApp(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme == "about" || scheme == "blob" || scheme == "data") return true
        if (scheme != "https" && scheme != "http") return false
        return uri.host?.lowercase() == SITE_HOST
    }

    private fun openExternal(uri: Uri): Boolean {
        return try {
            val view = if (uri.scheme.equals("intent", ignoreCase = true)) {
                Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).addCategory(Intent.CATEGORY_BROWSABLE)
            } else {
                Intent(Intent.ACTION_VIEW, uri)
            }
            startActivity(view)
            true
        } catch (_: ActivityNotFoundException) {
            val fallback = uri.getQueryParameter("browser_fallback_url")
            if (fallback != null) {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fallback)))
                true
            } else {
                Toast.makeText(this, R.string.no_wallet_app, Toast.LENGTH_LONG).show()
                false
            }
        }
    }

    private inner class ShellClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!request.isForMainFrame) return false
            val uri = request.url
            if (staysInApp(uri)) return false
            return openExternal(uri)
        }

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            if (Uri.parse(url).host?.lowercase() == SITE_HOST) lastUrl = url
            offline.visibility = View.GONE
            progress.visibility = View.VISIBLE
        }

        override fun onPageFinished(view: WebView, url: String) {
            progress.visibility = View.GONE
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            progress.visibility = View.GONE
            offline.visibility = View.VISIBLE
        }
    }

    private inner class ShellChrome : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            progress.progress = newProgress
            progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
        }

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = filePathCallback
            return try {
                fileChooser.launch(fileChooserParams.createIntent())
                true
            } catch (_: ActivityNotFoundException) {
                fileCallback = null
                false
            }
        }
    }

    companion object {
        const val SITE_HOST = "equicurve.vercel.app"
        const val START_URL = "https://equicurve.vercel.app/"
        const val USER_AGENT_TOKEN = "EquiCurveAndroid/0.3.5"
        private const val STATE_URL = "url"
    }
}
