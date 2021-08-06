import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';
import { merge } from './util';

export interface IOrder {
  name: string;     // Name of the order
  segments: IOrderSegment[];
}

export interface IOrderSegment {
  include?: string;     // Include another order by name
  query?: string;       // Query against ITrackHydrated for sort key (always after include)
                        // (query can be followed by comma and sort order)
}

let theFile: ArrayFileHandler<IOrder> | undefined;
const orderFile = () => theFile ||= new ArrayFileHandler<IOrder>('orders.json');

export const fetchAll = () => orderFile().fetch();

export const find = (name: string, orders?: IOrder[]) => _.find(orders ?? fetchAll(), (o) => o.name === name);
export const save = (order: IOrder) => {
  const orders = fetchAll();
  const existing = find(order.name, orders);
  if (existing) {
    merge(existing, order);
    orderFile().save(orders);
  } else {
    orderFile().save([ ...orders, order ]);
  }
};

export const makeKeys = (orderName: string): string[] => {
  const order = find(orderName);
  if (!order) {
    console.error(`Could not fetch order ${orderName}`);
    return [];
  }
  return order.segments.reduce<string[]>((accum, segment) => [
    ...accum,
    ...(segment.include ? makeKeys(segment.include) : []),
    ...(segment.query ? [segment.query] : []),
  ], []);
}
