import { Cart } from './cart/cart';
import { CartLoader } from './cart/loader';
import { System } from './system/system';

const FRAME_LIMITER = 60;

class App {
  private system: System;
  private cartLoader: CartLoader;
  private clockInterval: number;
  private frames: number = 0;
  private start: number;

  constructor() {
    this.cartLoader = new CartLoader(
      document.documentElement, this.handleCartLoaded.bind(this)
    );
  }

  handleCartLoaded(cart: Cart) {
    console.log('cart loaded');
    this.system = new System(cart, document.documentElement);
    this.clockInterval = setInterval(this.clock.bind(this), 0);
    this.start = Date.now();
  }

  clock() {
    this.frames++;
    this.system.renderFrame();
    if (this.frames >= FRAME_LIMITER) {
      clearInterval(this.clockInterval);
      console.log(Date.now() - this.start);
    }
  }
}

const app = new App();
