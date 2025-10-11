import { Cart } from './cart/cart';
import { CartLoader } from './cart/loader';
import { System } from './system/system';

const STOP_CLOCK = 25;

class App {
  private system: System;
  private cartLoader: CartLoader;
  private clockInterval: number;
  private clocks: number = 0;
  private start: number;

  constructor() {
    this.cartLoader = new CartLoader(
      document.documentElement, this.handleCartLoaded.bind(this)
    );
  }

  handleCartLoaded(cart: Cart) {
    console.log('cart loaded');
    this.system = new System(cart);
    this.clockInterval = setInterval(this.clock.bind(this), 0);
    this.start = Date.now();
  }

  clock() {
    this.clocks++;
    if (this.clocks >= STOP_CLOCK) {
      clearInterval(this.clockInterval);
      console.log(Date.now() - this.start);
    }

    for (let i = 0; i < 100; i++) {
      this.system.clock();
    }
  }
}

const app = new App();
