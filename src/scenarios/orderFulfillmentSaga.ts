import { WorkflowDefinition } from '../types';

export function createOrderFulfillmentSagaWorkflow(): WorkflowDefinition {
  return {
    id: 'wf_order_fulfillment_saga',
    name: 'Distributed E-Commerce Order Saga (with Saga Rollback)',
    description: 'Demonstrates distributed ACID transaction coordination across Inventory, Payment, and Logistics services with automatic backward compensation rollback on failure.',
    version: '1.4.0',
    tags: ['Saga-Pattern', 'Distributed-Transactions', 'Rollback', 'Financial-Integrity'],
    steps: [
      {
        id: 'step_reserve_inventory',
        name: 'Step 1: Reserve SKU Inventory',
        type: 'TASK',
        dependencies: [],
        execute: async ctx => {
          const sku = ctx.state.sku || 'SKU-QUANTUM-GPU-4090';
          const quantity = ctx.state.quantity || 2;
          ctx.log(`Attempting to lock ${quantity} units of [${sku}] in warehouse...`, 'info');
          ctx.reportProgress(40, 'Acquiring distributed lock');
          await new Promise(r => setTimeout(r, 200));

          const reservation = {
            reservationId: `RES-${Date.now().toString().slice(-6)}`,
            sku,
            quantity,
            warehouse: 'US-CENTRAL-1',
            status: 'RESERVED',
          };

          ctx.log(`Inventory successfully reserved: ${reservation.reservationId}`, 'info');
          ctx.reportProgress(100, 'Inventory locked');
          return reservation;
        },
        compensation: async ctx => {
          const reservation = ctx.stepOutput;
          ctx.log(`[COMPENSATION] Releasing inventory hold ${reservation?.reservationId} (${reservation?.quantity} units of ${reservation?.sku})...`, 'warn');
          await new Promise(r => setTimeout(r, 150));
          ctx.log(`[COMPENSATION] Inventory hold ${reservation?.reservationId} successfully released back to warehouse stock.`, 'info');
          return { released: true, reservationId: reservation?.reservationId };
        },
      },
      {
        id: 'step_authorize_payment',
        name: 'Step 2: Authorize & Charge Payment',
        type: 'TASK',
        dependencies: ['step_reserve_inventory'],
        execute: async ctx => {
          const amount = ctx.state.amount || 1999.98;
          ctx.log(`Charging customer card \$${amount} via Stripe/Adyen gateway...`, 'info');
          ctx.reportProgress(50, 'Authorizing credit card transaction');
          await new Promise(r => setTimeout(r, 250));

          const payment = {
            transactionId: `TXN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
            amount,
            currency: 'USD',
            status: 'AUTHORIZED_AND_CAPTURED',
          };

          ctx.log(`Payment authorized successfully: ${payment.transactionId} (\$${payment.amount})`, 'info');
          ctx.reportProgress(100, 'Payment captured');
          return payment;
        },
        compensation: async ctx => {
          const payment = ctx.stepOutput;
          ctx.log(`[COMPENSATION] Issuing immediate full refund for transaction ${payment?.transactionId} (\$${payment?.amount})...`, 'warn');
          await new Promise(r => setTimeout(r, 200));
          ctx.log(`[COMPENSATION] Refund of \$${payment?.amount} credited back to customer card. Transaction voided.`, 'info');
          return { refunded: true, transactionId: payment?.transactionId, amount: payment?.amount };
        },
      },
      {
        id: 'step_allocate_courier',
        name: 'Step 3: Allocate Priority Logistics Courier',
        type: 'TASK',
        dependencies: ['step_authorize_payment'],
        execute: async ctx => {
          ctx.log('Booking priority DHL Express courier pickup...', 'info');
          ctx.reportProgress(60, 'Routing courier');
          await new Promise(r => setTimeout(r, 200));

          const courier = {
            trackingNumber: `1Z99999999${Date.now().toString().slice(-4)}`,
            carrier: 'DHL Express Next-Day Air',
            pickupScheduled: new Date(Date.now() + 3600000).toISOString(),
            status: 'COURIER_DISPATCHED',
          };

          ctx.log(`Courier dispatched with tracking: ${courier.trackingNumber}`, 'info');
          ctx.reportProgress(100, 'Courier confirmed');
          return courier;
        },
        compensation: async ctx => {
          const courier = ctx.stepOutput;
          ctx.log(`[COMPENSATION] Cancelling courier dispatch for tracking ${courier?.trackingNumber}...`, 'warn');
          await new Promise(r => setTimeout(r, 150));
          ctx.log(`[COMPENSATION] Courier dispatch ${courier?.trackingNumber} cancelled. Restocking manifest.`, 'info');
          return { cancelled: true, trackingNumber: courier?.trackingNumber };
        },
      },
      {
        id: 'step_finalize_shipping_manifest',
        name: 'Step 4: Finalize Shipping Manifest & Export Customs',
        type: 'TASK',
        dependencies: ['step_allocate_courier'],
        retryPolicy: { maxAttempts: 1, initialIntervalMs: 100, maxIntervalMs: 200, backoffMultiplier: 1, jitter: false },
        execute: async ctx => {
          ctx.log('Verifying international export compliance and generating customs documentation...', 'info');
          ctx.reportProgress(50, 'Customs compliance check');
          await new Promise(r => setTimeout(r, 200));

          // Check if user requested a failure simulation to demonstrate saga compensation
          if (ctx.state.simulateFailure || ctx.state.triggerSagaRollback) {
            ctx.log('Simulating downstream carrier customs validation failure!', 'error');
            throw new Error('CustomsExportComplianceException: Tariff classification mismatch for high-density compute hardware');
          }

          const manifest = {
            manifestId: `MNF-${Date.now().toString().slice(-6)}`,
            exportCleared: true,
            status: 'FULFILLMENT_COMPLETE',
            estimatedDelivery: 'Tomorrow, 10:30 AM',
          };

          ctx.log(`Order fulfillment finalized! Manifest: ${manifest.manifestId}`, 'info');
          ctx.reportProgress(100, 'Complete');
          return manifest;
        },
      },
    ],
  };
}
