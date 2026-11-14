package com.darecords.daworks;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SyncFilePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
