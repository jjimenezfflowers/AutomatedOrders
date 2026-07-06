let products = [];
let orderConfig = {};

// Tab management
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
    el.classList.add('text-gray-500');
  });
  
  document.getElementById(`content-${tab}`).classList.remove('hidden');
  document.getElementById(`tab-${tab}`).classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
}

// Load data
async function loadData() {
  try {
    const [productsRes, orderRes] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/order-config')
    ]);
    
    products = await productsRes.json();
    orderConfig = await orderRes.json();
    
    renderProducts();
    renderProductSelection();
    updateSelectedProducts();
    loadCustomerInfo();
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Products
function renderProducts() {
  const container = document.getElementById('products-list');
  container.innerHTML = products.map((product, index) => `
    <div class="border border-gray-300 rounded-lg p-4">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
          <input type="text" value="${product.id}" onchange="products[${index}].id = this.value" 
                 class="w-full px-3 py-2 border border-gray-300 rounded">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value="${product.name}" onchange="products[${index}].name = this.value" 
                 class="w-full px-3 py-2 border border-gray-300 rounded">
        </div>
        <div class="col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">URL</label>
          <input type="text" value="${product.url}" onchange="products[${index}].url = this.value" 
                 class="w-full px-3 py-2 border border-gray-300 rounded">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Quantity Selector</label>
          <input type="text" value="${product.quantitySelector}" onchange="products[${index}].quantitySelector = this.value" 
                 class="w-full px-3 py-2 border border-gray-300 rounded">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Default Quantity</label>
          <input type="number" value="${product.defaultQuantity}" onchange="products[${index}].defaultQuantity = parseInt(this.value)" 
                 class="w-full px-3 py-2 border border-gray-300 rounded">
        </div>
      </div>
      <button onclick="deleteProduct(${index})" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm mt-3">Delete</button>
    </div>
  `).join('');
}

function addProduct() {
  products.push({
    id: '',
    name: '',
    url: '',
    quantitySelector: '',
    defaultQuantity: 1
  });
  renderProducts();
}

function deleteProduct(index) {
  products.splice(index, 1);
  renderProducts();
}

async function saveProducts() {
  console.log('Saving products:', products); // Debug
  try {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(products)
    });
    const result = await response.json();
    if (result.success) {
      alert('Products saved!');
      // Refresh product selection after saving
      renderProductSelection();
    } else {
      alert('Error saving products');
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// Product selection
function renderProductSelection() {
  const container = document.getElementById('product-selection');
  container.innerHTML = products.map((product, index) => `
    <label class="flex items-center space-x-3 p-3 bg-white rounded border cursor-pointer hover:bg-gray-50">
      <input type="checkbox" 
             onchange="toggleProductSelection('${product.id}')" 
             class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
      <div class="flex-1">
        <div class="font-medium text-gray-900">${product.name}</div>
        <div class="text-sm text-gray-500">${product.id}</div>
      </div>
    </label>
  `).join('');
}

function toggleProductSelection(productId) {
  if (!orderConfig.orders) orderConfig.orders = [];
  
  const existingIndex = orderConfig.orders.findIndex(order => order.productId === productId);
  
  if (existingIndex >= 0) {
    // Remove product
    orderConfig.orders.splice(existingIndex, 1);
  } else {
    // Add product with default quantity
    const product = products.find(p => p.id === productId);
    orderConfig.orders.push({
      productId: productId,
      quantity: product ? product.defaultQuantity : 1
    });
  }
  
  updateSelectedProducts();
}

function updateSelectedProducts() {
  const container = document.getElementById('order-items');
  const orders = orderConfig.orders || [];
  
  container.innerHTML = orders.map((order, index) => {
    const product = products.find(p => p.id === order.productId);
    return `
      <div class="flex items-center space-x-3 p-3 bg-blue-50 rounded border border-blue-200">
        <div class="flex-1">
          <div class="font-medium text-gray-900">${product ? product.name : order.productId}</div>
        </div>
        <input type="number" value="${order.quantity}" 
               onchange="orderConfig.orders[${index}].quantity = parseInt(this.value)" 
               class="w-20 px-2 py-1 border border-gray-300 rounded text-center" 
               placeholder="Qty" min="1">
        <button onclick="removeSelectedProduct('${order.productId}')" 
                class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-sm">×</button>
      </div>
    `;
  }).join('');
  
  // Update checkboxes to reflect current selection
  document.querySelectorAll('#product-selection input[type="checkbox"]').forEach(checkbox => {
    const productId = checkbox.parentElement.querySelector('.text-sm').textContent;
    checkbox.checked = orders.some(order => order.productId === productId);
  });
  
  document.getElementById('deliveryDate').value = orderConfig.deliveryDate || '';
}

function removeSelectedProduct(productId) {
  if (orderConfig.orders) {
    orderConfig.orders = orderConfig.orders.filter(order => order.productId !== productId);
    updateSelectedProducts();
  }
}

async function saveOrder() {
  orderConfig.deliveryDate = document.getElementById('deliveryDate').value;
  
  try {
    const response = await fetch('/api/order-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderConfig)
    });
    const result = await response.json();
    alert(result.success ? 'Order saved!' : 'Error saving order');
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// Customer info
function loadCustomerInfo() {
  const customer = orderConfig.customerInfo || {};
  const payment = orderConfig.payment || {};
  
  document.getElementById('email').value = customer.email || '';
  document.getElementById('phone').value = customer.phone || '';
  document.getElementById('firstName').value = customer.firstName || '';
  document.getElementById('lastName').value = customer.lastName || '';
  document.getElementById('address').value = customer.address || '';
  document.getElementById('city').value = customer.city || '';
  document.getElementById('state').value = customer.state || '';
  document.getElementById('zipCode').value = customer.zipCode || '';
  document.getElementById('cardNumber').value = payment.cardNumber || '';
  document.getElementById('cvv').value = payment.cvv || '';
  document.getElementById('expiry').value = payment.expiry || '';
}

async function saveCustomer() {
  orderConfig.customerInfo = {
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    firstName: document.getElementById('firstName').value,
    lastName: document.getElementById('lastName').value,
    address: document.getElementById('address').value,
    city: document.getElementById('city').value,
    state: document.getElementById('state').value,
    zipCode: document.getElementById('zipCode').value
  };
  
  orderConfig.payment = {
    cardNumber: document.getElementById('cardNumber').value,
    cvv: document.getElementById('cvv').value,
    expiry: document.getElementById('expiry').value
  };
  
  try {
    const response = await fetch('/api/order-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderConfig)
    });
    const result = await response.json();
    alert(result.success ? 'Customer info saved!' : 'Error saving');
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// Run test
async function runTest() {
  const outputDiv = document.getElementById('test-output');
  outputDiv.classList.remove('hidden');
  outputDiv.textContent = 'Running test... Please wait...';
  
  try {
    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout
    
    const response = await fetch('/api/run-test', { 
      method: 'POST',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const result = await response.json();
    outputDiv.textContent = result.output;
    
    if (result.success) {
      alert('✅ Order placed successfully!');
      // Reload history after successful order
      await loadHistory();
    } else {
      alert('❌ Test failed. Check output below.');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      outputDiv.textContent = 'Test is running... Check the terminal for progress. The order may have been placed successfully.';
      alert('⏳ Test is taking longer than expected. Check if the order was placed successfully.');
      // Still reload history in case the order was placed
      await loadHistory();
    } else {
      outputDiv.textContent = 'Error: ' + error.message;
    }
  }
}

// Order history
async function loadHistory() {
  try {
    const response = await fetch('/api/order-history');
    const history = await response.json();
    renderHistory(history);
  } catch (error) {
    console.error('Error loading history:', error);
  }
}

function renderHistory(history) {
  const container = document.getElementById('history-list');
  
  if (!history || history.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">No orders yet</p>';
    return;
  }
  
  container.innerHTML = history.reverse().map((entry, index) => {
    const date = new Date(entry.date);
    const dateStr = date.toLocaleString();
    
    return `
      <div class="border border-gray-300 rounded-lg p-4 hover:shadow-lg transition">
        <div class="flex justify-between items-start mb-2">
          <div>
            <h3 class="text-lg font-semibold text-blue-600">${entry.orderNumber}</h3>
            <p class="text-sm text-gray-500">${dateStr}</p>
          </div>
          <span class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">Completed</span>
        </div>
        <div class="mt-3">
          <p class="text-sm text-gray-600"><strong>Customer:</strong> ${entry.customer}</p>
          <p class="text-sm text-gray-600 mt-1"><strong>Products:</strong></p>
          <ul class="ml-4 mt-1">
            ${entry.products.map(p => `<li class="text-sm text-gray-600">• ${p.productId} (Qty: ${p.quantity})</li>`).join('')}
          </ul>
          ${entry.total ? `<p class="text-sm text-gray-600 mt-2"><strong>Total:</strong> ${entry.total}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Initialize
loadData();
loadHistory();
