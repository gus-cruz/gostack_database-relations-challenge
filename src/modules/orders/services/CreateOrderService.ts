import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('There is no customer with the provided id.');
    }

    const requestedProducts = await this.productsRepository.findAllById(
      products,
    );

    const requestedProductsId = requestedProducts.map(product => product.id);

    const invalidProducts = products.filter(
      product => !requestedProductsId.includes(product.id),
    );

    if (invalidProducts.length) {
      throw new AppError(
        `There is no product with the provided id "${invalidProducts[0].id}".`,
      );
    }

    const productsWithNoAvailableQuantity = products.filter(
      product =>
        requestedProducts.filter(p => p.id === product.id)[0].quantity <
        product.quantity,
    );

    if (productsWithNoAvailableQuantity.length) {
      throw new AppError(
        `The requested quantity for product with id "${productsWithNoAvailableQuantity[0].id}" is not available.`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: requestedProducts.filter(p => p.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        requestedProducts.filter(p => p.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
