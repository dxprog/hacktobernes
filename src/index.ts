import { Cart } from './cart/cart';
import { CartLoader } from './cart/loader';
import { System } from './system/system';

class App {
  private system: System;
  private cartLoader: CartLoader;

  constructor() {
    this.cartLoader = new CartLoader(
      document.documentElement, this.handleCartLoaded.bind(this)
    );
  }

  handleCartLoaded(cart: Cart) {
    console.log('cart loaded');
    this.system = new System(cart);
  }
}

const app = new App();
