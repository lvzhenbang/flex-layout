/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {Inject, Injectable} from '@angular/core';

import {mergeAlias} from '../add-alias';
import {MediaChange} from '../media-change';
import {BreakPoint} from '../breakpoints/break-point';
import {LAYOUT_CONFIG, LayoutConfigOptions} from '../tokens/library-config';
import {BreakPointRegistry, OptionalBreakPoint} from '../breakpoints/break-point-registry';
import {sortDescendingPriority} from '../breakpoints/breakpoint-tools';

/**
 * Interface to apply PrintHook to call anonymous `target.updateStyles()`
 */
export interface HookTarget {
  activatedBreakpoints: BreakPoint[];

  updateStyles(): void;
}

const PRINT = 'print';
export const BREAKPOINT_PRINT = {
  alias: PRINT,
  mediaQuery: PRINT,
  priority: 1000
};

/**
 * PrintHook - Use to intercept print MediaQuery activations and force
 *             layouts to render with the specified print alias/breakpoint
 *
 * Used in MediaMarshaller and MediaObserver
 */
@Injectable({providedIn: 'root'})
export class PrintHook {
  constructor(
      protected breakpoints: BreakPointRegistry,
      @Inject(LAYOUT_CONFIG) protected layoutConfig: LayoutConfigOptions) {
  }

  /** Add 'print' mediaQuery: to listen for matchMedia activations */
  withPrintQuery(queries: string[]): string[] {
    return [...queries, PRINT];
  }

  /** Is the MediaChange event for any 'print' @media */
  isPrintEvent(e: MediaChange): Boolean {
    return e.mediaQuery.startsWith(PRINT);
  }

  /** Is this service currently in Print-mode ? */
  get isPrinting(): boolean {
    return this.queue.hasPrintBps;
  }

  /** What is the desired mqAlias to use while printing? */
  get printAlias(): string[] {
    return this.layoutConfig.printWithBreakpoints || [];
  }

  /** Lookup breakpoints associated with print aliases. */
  get printBreakPoints(): BreakPoint[] {
    return this.printAlias
        .map(alias => this.breakpoints.findByAlias(alias))
        .filter(bp => bp !== null) as BreakPoint[];
  }

  /** Lookup breakpoint associated with mediaQuery */
  getEventBreakpoints({mediaQuery}: MediaChange): BreakPoint[] {
    const bp = this.breakpoints.findByQuery(mediaQuery);
    const list = bp ? [...this.printBreakPoints, bp] : this.printBreakPoints;

    return list.sort(sortDescendingPriority);
  }

  /** Update event with printAlias mediaQuery information */
  updateEvent(event: MediaChange): MediaChange {
    let bp: OptionalBreakPoint = this.breakpoints.findByQuery(event.mediaQuery);
    if (this.isPrintEvent(event)) {
      // Reset from 'print' to first (highest priority) print breakpoint
      bp = this.getEventBreakpoints(event)[0];
      event.mediaQuery = bp ? bp.mediaQuery : '';
    }
    return mergeAlias(event, bp);
  }

  /**
   * Prepare RxJs filter operator with partial application
   * @return pipeable filter predicate
   */
  interceptEvents(target: HookTarget) {
    return (event: MediaChange): boolean => {
      if (this.isPrintEvent(event)) {
        if (event.matches) {
          this.startPrinting(target, this.getEventBreakpoints(event));
          target.updateStyles();

        } else if (!event.matches) {
          this.stopPrinting(target);
          target.updateStyles();
        }
      } else {
        this.collectActivations(event);
      }

      // Stop event propagation ?
      return !(this.isPrinting || this.isPrintEvent(event));
    };
  }

  /**
   * Save current activateBreakpoints (for later restore)
   * and substitute only the printAlias breakpoint
   */
  protected startPrinting(target: HookTarget, bpList: OptionalBreakPoint[]) {
    target.activatedBreakpoints = this.queue.addPrintBps(bpList);
  }

  /** For any print deactivations, reset the entire print queue */
  protected stopPrinting(target: HookTarget) {
    if (this.isPrinting) {
      this.queue.clear();
      target.activatedBreakpoints = this.deactivations;
    }
  }

  /**
   * To restore pre-Print Activations, we must capture the proper
   * list of breakpoint activations BEFORE print starts. OnBeforePrint()
   * is not supported; so 'print' mediaQuery activations must be used.
   *
   * >  But activated breakpoints are deactivated BEFORE 'print' activation.
   *
   * Let's capture all de-activations using the following logic:
   *
   *  When not printing:
   *    - clear cache when activating non-print breakpoint
   *    - update cache (and sort) when deactivating
   *
   *  When printing:
   *    - sort and save when starting print
   *    - restore as activatedTargets and clear when stop printing
   */
  collectActivations(event: MediaChange) {
    const isDeactivation = (event.matches === false);
    if (isDeactivation) {
      const bp = this.breakpoints.findByQuery(event.mediaQuery);
      if (bp) {
        this.deactivations.push(bp);
        this.deactivations.sort(sortDescendingPriority);
      }
    } else {
      this.deactivations = [];
    }
  }

  private deactivations: BreakPoint[] = [];
  private queue: PrintQueue = new PrintQueue();

}

// ************************************************************************
// Internal Utility class 'PrintQueue'
// ************************************************************************

/**
 * Utility class to manage print breakpoints + activatedBreakpoints
 * with correct sorting WHILE printing
 */
class PrintQueue {
  /** Sorted queue with prioritized print breakpoints */
  get printBreakpoints(): BreakPoint[] {
    return [...this.printBps];
  }

  /** Accessor to determine if 1 or more print breakpoints are queued */
  get hasPrintBps(): boolean {
    return (this.printBps.length > 0);
  }

  addPrintBps(bpList: OptionalBreakPoint[]): BreakPoint[] {
    bpList.push(BREAKPOINT_PRINT);
    bpList.sort(sortDescendingPriority);
    bpList.forEach(bp => this.addPrintBp(bp));

    return this.printBreakpoints;
  }

  /** Add Print breakpoint to queue */
  addPrintBp(bp: OptionalBreakPoint) {
    if (!!bp) {
      const bpInList = this.printBps.find(it => it.mediaQuery === bp.mediaQuery);
      if (bpInList === undefined) {
        // If a printAlias breakpoint, then append. If a true print breakpoint,
        // register as highest priority in the queue
        this.printBps = isPrintBreakPoint(bp) ? [bp, ...this.printBps] : [...this.printBps, bp];
      }
    }

  }

  /** Restore original activated breakpoints and clear internal caches */
  clear() {
    this.printBps = [];
  }

  private printBps: BreakPoint[] = [];
}

// ************************************************************************
// Internal Utility methods
// ************************************************************************

/** Only support intercept queueing if the Breakpoint is a print @media query */
function isPrintBreakPoint(bp: OptionalBreakPoint) {
  return bp ? bp.mediaQuery.startsWith(PRINT) : false;
}
