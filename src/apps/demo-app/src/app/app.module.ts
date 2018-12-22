import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {FlexLayoutModule} from '@angular/flex-layout';

import {RoutingModule} from './routing.module';
import {AppComponent} from './app.component';
import {DemoMaterialModule} from './material.module';
import {WatermarkComponent} from './watermark.component';

@NgModule({
  declarations: [
    AppComponent, WatermarkComponent
  ],
  imports: [
    BrowserModule.withServerTransition({ appId: 'serverApp' }),
    BrowserAnimationsModule,
    RoutingModule,
    DemoMaterialModule,
    FlexLayoutModule.withConfig({
      useColumnBasisZero: false,
      printWithBreakpoints: ['md', 'gt-sm', 'gt-xs']
    }),
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
