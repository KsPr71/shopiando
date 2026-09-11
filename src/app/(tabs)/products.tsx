import { Redirect, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SideMenu } from '@/components/side-menu';
import { ImageZoomPreview } from '@/components/image-zoom-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  createPurchaseOrder,
  loadProductCatalog,
  type OrderAssignee,
  type OrderLine,
} from '@/services/product-orders';
import {
  addProduct,
  deleteProduct,
  getCachedProducts,
  getProductCategories,
  getProducts,
  isProductAdmin,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_OPTIONS,
  quoteProductOrder,
  setProductAvailability,
  subscribeToProductCatalog,
  updateProduct,
  type Product,
  type ProductCategory,
  type ProductCategoryOption,
  type ProductUnitType,
} from '@/services/product-catalog';
import { addSupplier, getSuppliers, type Supplier } from '@/services/suppliers';
import { getUserBooleanPreference, setUserBooleanPreference } from '@/services/user-preferences';

export default function ProductsScreen() {
  const [symbolsLoaded] = useFonts({ MaterialSymbols: MaterialSymbols_400Regular });
  const { isReady, user, signOut } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [assignees, setAssignees] = useState<OrderAssignee[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigneeModalVisible, setIsAssigneeModalVisible] = useState(false);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isSupplierPickerVisible, setIsSupplierPickerVisible] = useState(false);
  const [isCategoryPickerVisible, setIsCategoryPickerVisible] = useState(false);
  const [isNewSupplierVisible, setIsNewSupplierVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newUnitType, setNewUnitType] = useState<ProductUnitType>('unit');
  const [newPackageQuantity, setNewPackageQuantity] = useState('1');
  const [newCategory, setNewCategory] = useState<ProductCategory>('carnicos');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [newSupplierId, setNewSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [categories, setCategories] = useState<ProductCategoryOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const [groupBySupplier, setGroupBySupplier] = useState(false);
  const [newImage, setNewImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [catalogSyncStatus, setCatalogSyncStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isMounted = true;
    let hasCachedProducts = false;
    setIsLoading(true);
    void getUserBooleanPreference(user.id, 'products.group_by_supplier')
      .then((value) => {
        if (isMounted) {
          setGroupBySupplier(value);
        }
      })
      .catch(() => {});
    void getCachedProducts()
      .then((cachedProducts) => {
        if (isMounted && cachedProducts.length) {
          hasCachedProducts = true;
          setProducts(cachedProducts);
          setIsLoading(false);
        }
      })
      .catch(() => {});
    Promise.all([getProducts(), getProductCategories(), getSuppliers(), loadProductCatalog(user.id, user.email, getDisplayName(user))])
      .then(([catalogProducts, catalogCategories, catalogSuppliers, { assignees: catalogAssignees }]) => {
        if (isMounted) {
          setProducts(catalogProducts);
          setCategories(catalogCategories);
          setSuppliers(catalogSuppliers);
          setNewCategory(catalogCategories[0]?.slug ?? PRODUCT_CATEGORIES[0]);
          setAssignees(catalogAssignees);
        }
      })
      .catch(() => {
        if (isMounted && !hasCachedProducts) {
          setError('No se pudo cargar el catálogo de productos.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    const unsubscribe = subscribeToProductCatalog(
      (change) => {
        if (!isMounted) {
          return;
        }
        setProducts((currentProducts) => change.type === 'delete'
          ? currentProducts.filter((product) => product.id !== change.productId)
          : currentProducts.some((product) => product.id === change.product.id)
            ? currentProducts.map((product) => product.id === change.product.id ? change.product : product)
            : [change.product, ...currentProducts]);
      },
      (status) => {
        if (isMounted) {
          setCatalogSyncStatus(status);
        }
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user]);

  function toggleGroupBySupplier() {
    if (!user) {
      return;
    }

    setGroupBySupplier((currentValue) => {
      const nextValue = !currentValue;
      void setUserBooleanPreference(user.id, 'products.group_by_supplier', nextValue).catch(() => {});
      return nextValue;
    });
  }

  const orderLines = useMemo<OrderLine[]>(
    () => products
      .filter((product) => cart[product.id])
      .map((product) => ({
        id: product.id,
        name: product.name,
        unit: product.unitType === 'pound' ? 'libra' : 'unidad',
        priceCents: product.priceCents,
        quantity: cart[product.id],
        supplierName: suppliers.find((supplier) => supplier.id === product.supplierId)?.name ?? 'Sin proveedor',
      })),
    [cart, products, suppliers]
  );
  const totalCents = orderLines.reduce((total, line) => total + line.priceCents * line.quantity, 0);
  const cartCount = orderLines.reduce((total, line) => total + line.quantity, 0);

  if (!isReady) {
    return <ThemedView style={styles.centered}><ActivityIndicator /></ThemedView>;
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  const profileUser = user;
  const canManageCatalog = isProductAdmin(user);
  const visibleProducts = products.filter((product) =>
    (canManageCatalog || product.isAvailable)
    && (selectedCategory === 'all' || product.category === selectedCategory)
  );
  const productsForDisplay = groupBySupplier
    ? [...visibleProducts].sort((first, second) => {
      const firstSupplier = suppliers.find((supplier) => supplier.id === first.supplierId)?.name ?? 'Sin proveedor';
      const secondSupplier = suppliers.find((supplier) => supplier.id === second.supplierId)?.name ?? 'Sin proveedor';
      return firstSupplier.localeCompare(secondSupplier) || first.name.localeCompare(second.name);
    })
    : visibleProducts;

  function addProductToCart(product: Product) {
    setCart((currentCart) => {
      const nextCart = { ...currentCart };
      nextCart[product.id] = (nextCart[product.id] ?? 0) + 1;
      return nextCart;
    });
    setMessage(null);
    setError(null);
  }

  function removeProductFromCart(productId: string) {
    setCart((currentCart) => {
      const quantity = currentCart[productId] ?? 0;
      if (quantity <= 1) {
        const { [productId]: _removedProduct, ...remainingCart } = currentCart;
        return remainingCart;
      }
      return { ...currentCart, [productId]: quantity - 1 };
    });
    setMessage(null);
    setError(null);
  }

  function requestCheckout() {
    if (!orderLines.length) {
      setError('Añade productos antes de finalizar el pedido.');
      return;
    }

    setError(null);
    setIsAssigneeModalVisible(true);
  }

  async function chooseProductImage() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Necesitamos permiso para seleccionar la imagen del producto.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        setNewImage(result.assets[0]);
        setError(null);
      }
    } catch (imageError) {
      setError(imageError instanceof Error ? `No se pudo abrir la imagen: ${imageError.message}` : 'No se pudo seleccionar la imagen.');
    }
  }

  async function saveProduct() {
    const priceCents = Math.round(Number(newPrice.replace(',', '.')) * 100);
    const packageQuantity = Number(newPackageQuantity.replace(',', '.'));
    if (!newName.trim() || !newDescription.trim() || !newSupplierId || !Number.isFinite(priceCents) || priceCents < 0 || !Number.isFinite(packageQuantity) || packageQuantity <= 0) {
      setError('Completa nombre, descripción, proveedor y un precio válido.');
      return;
    }
    setIsSavingProduct(true);
    setError(null);
    const isEditing = Boolean(editingProduct);
    try {
      const product = editingProduct
        ? await updateProduct(editingProduct.id, { name: newName, description: newDescription, category: newCategory, priceCents, unitType: newUnitType, packageQuantity, supplierId: newSupplierId, image: newImage })
        : await addProduct({ name: newName, description: newDescription, category: newCategory, priceCents, unitType: newUnitType, packageQuantity, supplierId: newSupplierId, image: newImage });
      setProducts((currentProducts) => editingProduct ? currentProducts.map((item) => item.id === product.id ? product : item) : [product, ...currentProducts]);
      setNewName('');
      setNewDescription('');
      setNewPrice('');
      setNewPackageQuantity('1');
      setNewCategory('carnicos');
      setNewSupplierId('');
      setNewUnitType('unit');
      setNewImage(null);
      setEditingProduct(null);
      setIsAddModalVisible(false);
      setMessage(isEditing ? 'Producto actualizado.' : 'Producto añadido al catálogo.');
    } catch (productError) {
      setError(productError instanceof Error ? productError.message : 'No se pudo añadir el producto.');
    } finally {
      setIsSavingProduct(false);
    }
  }

  function openProductEditor(product: Product) {
    setEditingProduct(product);
    setNewName(product.name);
    setNewDescription(product.description);
    setNewPrice(String(product.priceCents / 100));
    setNewPackageQuantity(String(product.packageQuantity));
    setNewUnitType(product.unitType);
    setNewCategory(product.category);
    setNewSupplierId(product.supplierId ?? '');
    setNewImage(null);
    setError(null);
    setIsAddModalVisible(true);
  }

  function openNewProductForm() {
    setEditingProduct(null);
    setNewName('');
    setNewDescription('');
    setNewPrice('');
    setNewPackageQuantity('1');
    setNewUnitType('unit');
    setNewCategory(categories[0]?.slug ?? PRODUCT_CATEGORIES[0]);
    setNewSupplierId('');
    setNewImage(null);
    setError(null);
    setIsAddModalVisible(true);
  }

  async function saveSupplier() {
    if (!supplierName.trim()) {
      setError('Indica el nombre del proveedor.');
      return;
    }
    setIsSavingSupplier(true);
    try {
      const supplier = await addSupplier({ name: supplierName, address: supplierAddress, phone: supplierPhone });
      setSuppliers((current) => [...current, supplier].sort((first, second) => first.name.localeCompare(second.name)));
      setNewSupplierId(supplier.id);
      setSupplierName('');
      setSupplierAddress('');
      setSupplierPhone('');
      setIsNewSupplierVisible(false);
      setMessage('Proveedor añadido.');
    } catch (supplierError) {
      setError(supplierError instanceof Error ? supplierError.message : 'No se pudo añadir el proveedor.');
    } finally {
      setIsSavingSupplier(false);
    }
  }

  function confirmDeleteProduct(product: Product) {
    Alert.alert('Eliminar producto', `¿Eliminar ${product.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => removeProduct(product) },
    ]);
  }

  async function removeProduct(product: Product) {
    try {
      await deleteProduct(product.id);
      setProducts((currentProducts) => currentProducts.filter((item) => item.id !== product.id));
      setIsAddModalVisible(false);
      setEditingProduct(null);
      setMessage('Producto eliminado.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el producto.');
    }
  }

  async function finalizeOrder(assignee: OrderAssignee) {
    setIsSavingOrder(true);
    setError(null);

    try {
      const quote = await quoteProductOrder(orderLines.map((line) => ({ productId: line.id, quantity: line.quantity })));
      if (quote.length !== orderLines.length) {
        throw new Error('Uno o más productos ya no están disponibles. Actualiza el catálogo.');
      }
      const quotedLines = orderLines.map((line) => {
        const quotedLine = quote.find((item) => item.product_id === line.id);
        return quotedLine
          ? { ...line, priceCents: quotedLine.unit_price_cents, lineTotalCents: quotedLine.line_total_cents }
          : line;
      });
      const orderResult = await createPurchaseOrder(profileUser.id, profileUser.email, getDisplayName(profileUser), assignee.id, quotedLines);
      setCart({});
      setIsAssigneeModalVisible(false);
      if (orderResult.synced) {
        setMessage(`Pedido asignado a ${assignee.name}.`);
      } else {
        const syncError = orderResult.syncError ?? 'Error desconocido.';
        setError(`Pedido guardado localmente. No se sincronizó con Supabase: ${syncError}`);
        Alert.alert('Sincronización pendiente', `El pedido se guardó en el móvil, pero Supabase respondió: ${syncError}`);
      }
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : 'No se pudo finalizar el pedido.');
    } finally {
      setIsSavingOrder(false);
    }
  }

  async function toggleAvailability(product: Product, isAvailable: boolean) {
    setError(null);
    try {
      await setProductAvailability(product.id, isAvailable);
      setProducts((currentProducts) => currentProducts.map((item) => item.id === product.id ? { ...item, isAvailable } : item));
    } catch (availabilityError) {
      setError(availabilityError instanceof Error ? availabilityError.message : 'No se pudo actualizar la disponibilidad.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel="Abrir menú"
            accessibilityRole="button"
            onPress={() => setIsMenuVisible(true)}
            style={[styles.menuButton, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={styles.menuIcon}>≡</ThemedText>
          </Pressable>
          <View style={styles.titleBlock}>
            <ThemedText style={styles.title}>Productos</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>Arma tu pedido en pocos pasos.</ThemedText>
            <View style={styles.syncIndicator}>
              <View style={[styles.syncDot, { backgroundColor: catalogSyncStatus === 'live' ? theme.success : catalogSyncStatus === 'offline' ? theme.info : theme.primary }]} />
              <ThemedText themeColor="textSecondary" style={styles.syncText}>{catalogSyncStatus === 'live' ? 'Sincronizado' : catalogSyncStatus === 'offline' ? 'Sin conexión' : 'Sincronizando'}</ThemedText>
            </View>
          </View>
          <View accessibilityLabel={`${cartCount} productos en el carrito`} style={styles.cartControl}>
            <ThemedText style={[styles.materialIcon, { color: theme.text }]}>{symbolsLoaded ? 'shopping_cart' : '🛒'}</ThemedText>
            <View style={[styles.cartBadge, { backgroundColor: theme.primary }]}>
              <ThemedText style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</ThemedText>
            </View>
          </View>
          <Pressable accessibilityLabel="Añadir producto" accessibilityRole="button" onPress={openNewProductForm} style={[styles.addCatalogButton, { backgroundColor: theme.primary }]}>
            <ThemedText style={styles.addCatalogButtonText}>+</ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.productScroll}>
          <ScrollView horizontal contentContainerStyle={styles.categoryCarousel} showsHorizontalScrollIndicator={false} style={styles.categoryCarouselContainer}>
            <Pressable onPress={() => setSelectedCategory('all')} style={[styles.filterChip, { borderColor: theme.primary }, selectedCategory === 'all' && { backgroundColor: theme.primary }]}>
              <ThemedText style={[styles.filterChipText, selectedCategory === 'all' && styles.filterChipTextSelected]}>Todos</ThemedText>
            </Pressable>
            {(categories.length ? categories : PRODUCT_CATEGORY_OPTIONS).map((category) => (
              <Pressable key={category.slug} onPress={() => setSelectedCategory(category.slug)} style={[styles.filterChip, { borderColor: theme.primary }, selectedCategory === category.slug && { backgroundColor: theme.primary }]}>
                <ThemedText style={[styles.filterChipIcon, selectedCategory === category.slug && styles.filterChipTextSelected]}>{symbolsLoaded ? category.icon : '•'}</ThemedText>
                <ThemedText style={[styles.filterChipText, selectedCategory === category.slug && styles.filterChipTextSelected]}>{category.name}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: groupBySupplier }}
            onPress={toggleGroupBySupplier}
            style={styles.groupBySupplierControl}
          >
            <View style={[styles.groupCheckbox, { borderColor: groupBySupplier ? theme.primary : theme.textSecondary, backgroundColor: groupBySupplier ? theme.primary : 'transparent' }]}>
              <ThemedText style={styles.groupCheckboxIcon}>{groupBySupplier ? '✓' : ''}</ThemedText>
            </View>
            <ThemedText themeColor="textSecondary" style={styles.groupBySupplierText}>Agrupar por proveedor</ThemedText>
          </Pressable>
          {isLoading ? (
            <View style={styles.centered}><ActivityIndicator /></View>
          ) : (
            <View style={styles.productGrid}>
              {(() => {
                let previousSupplierName: string | null = null;
                return productsForDisplay.map((product) => {
                const quantity = cart[product.id] ?? 0;
                const isExpanded = expandedProducts[product.id] ?? false;
                const canEditProduct = canManageCatalog || product.ownerId === profileUser.id;
                const supplierName = suppliers.find((supplier) => supplier.id === product.supplierId)?.name ?? 'Sin proveedor';
                const showSupplierHeading = groupBySupplier && supplierName !== previousSupplierName;
                previousSupplierName = supplierName;
                return (
                  <View key={product.id}>
                    {showSupplierHeading ? <ThemedText style={[styles.supplierGroupTitle, { color: theme.primary }]}>{supplierName}</ThemedText> : null}
                  <ThemedView type="backgroundElement" style={[styles.productCard, !product.isAvailable && styles.inactiveProduct]}>
                    <ProductImage category={product.category} sourceUri={product.imageUrl} />
                    <View style={styles.productBody}>
                      <View style={styles.productHeader}>
                        <View style={styles.productInfo}>
                          <ThemedText numberOfLines={1} style={styles.productName}>{product.name}</ThemedText>
                          {isExpanded ? <ThemedText numberOfLines={2} themeColor="textSecondary" style={styles.productDescription}>{product.description}</ThemedText> : null}
                          <ThemedText themeColor="textSecondary" style={styles.productUnit}>{formatCategory(product.category)} · {formatUnit(product.unitType)}</ThemedText>
                        </View>
                        <View style={styles.priceBlock}>
                          <ThemedText style={[styles.productPrice, { color: theme.primary }]}>{formatPrice(product.priceCents)}</ThemedText>
                          <ThemedText themeColor="textSecondary" style={styles.unitPrice}>{formatPrice(product.priceCents / product.packageQuantity)} / {product.unitType === 'pound' ? 'lb' : 'ud'}</ThemedText>
                        </View>
                      </View>
                      <View style={styles.productFooter}>
                        <View style={styles.productActions}>
                        {isExpanded && canEditProduct ? <Pressable accessibilityLabel={`Editar ${product.name}`} onPress={() => openProductEditor(product)} style={styles.editButton}><ThemedText themeColor="info" style={styles.editButtonText}>Editar</ThemedText></Pressable> : null}
                        {isExpanded && canManageCatalog ? <Switch accessibilityLabel={`Cambiar disponibilidad de ${product.name}`} value={product.isAvailable} onValueChange={(value) => toggleAvailability(product, value)} trackColor={{ false: theme.backgroundSelected, true: theme.primary }} /> : null}
                        <Pressable accessibilityLabel={isExpanded ? `Ocultar detalles de ${product.name}` : `Ver detalles de ${product.name}`} onPress={() => setExpandedProducts((current) => ({ ...current, [product.id]: !isExpanded }))} style={[styles.chevronButton, { borderColor: theme.backgroundSelected }]}>
                          <ThemedText style={styles.materialIcon}>{symbolsLoaded ? (isExpanded ? 'expand_less' : 'expand_more') : '•'}</ThemedText>
                        </Pressable>
                        {quantity ? (
                          <View style={[styles.quantityControl, { borderColor: theme.backgroundSelected }]}>
                            <Pressable accessibilityLabel={`Quitar ${product.name} del pedido`} accessibilityRole="button" onPress={() => removeProductFromCart(product.id)} style={styles.quantityButton}>
                              <ThemedText style={[styles.quantityButtonIcon, { color: theme.text }]}>{symbolsLoaded ? 'remove' : '-'}</ThemedText>
                            </Pressable>
                            <ThemedText style={styles.quantityValue}>{quantity}</ThemedText>
                            <Pressable accessibilityLabel={`Añadir ${product.name} al pedido`} accessibilityRole="button" disabled={!product.isAvailable} onPress={() => addProductToCart(product)} style={[styles.quantityButton, !product.isAvailable && styles.disabled]}>
                              <ThemedText style={[styles.quantityButtonIcon, { color: theme.success }]}>{symbolsLoaded ? 'add' : '+'}</ThemedText>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            accessibilityLabel={`Añadir ${product.name} al pedido`}
                            accessibilityRole="button"
                            disabled={!product.isAvailable}
                            onPress={() => addProductToCart(product)}
                            style={[styles.addButton, !product.isAvailable && styles.disabled]}>
                            <ThemedText style={[styles.materialIcon, { color: theme.success }]}>{symbolsLoaded ? 'shopping_cart' : '+'}</ThemedText>
                          </Pressable>
                        )}
                        </View>
                      </View>
                    </View>
                  </ThemedView>
                  </View>
                );
              });
              })()}
            </View>
          )}
          {!isLoading && !visibleProducts.length ? <ThemedText themeColor="textSecondary" style={styles.emptyState}>No hay productos disponibles en esta categoría.</ThemedText> : null}

          {error ? <ThemedText style={[styles.feedback, { color: theme.info }]}>{error}</ThemedText> : null}
          {message ? <ThemedText style={[styles.feedback, { color: theme.success }]}>{message}</ThemedText> : null}
        </ScrollView>

        <View style={[styles.checkoutBar, { backgroundColor: theme.backgroundElement, borderTopColor: theme.backgroundSelected }]}>
          <View>
            <ThemedText themeColor="textSecondary" style={styles.checkoutLabel}>{cartCount} productos en el pedido</ThemedText>
            <ThemedText style={styles.checkoutTotal}>{formatPrice(totalCents)}</ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!orderLines.length}
            onPress={requestCheckout}
            style={({ pressed }) => [styles.checkoutButton, { backgroundColor: theme.primary }, !orderLines.length && styles.disabled, pressed && styles.pressed]}>
            <ThemedText style={styles.checkoutButtonText}>Finalizar pedido</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>

      <SideMenu onClose={() => setIsMenuVisible(false)} onSignOut={signOut} userEmail={profileUser.email} visible={isMenuVisible} />

      <Modal transparent animationType="fade" visible={isAssigneeModalVisible} onRequestClose={() => setIsAssigneeModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ThemedView type="backgroundElement" style={styles.assigneeModal}>
            <ThemedText style={styles.assigneeTitle}>Asignar pedido</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.assigneeCopy}>Selecciona la persona responsable de este pedido.</ThemedText>
            <View style={styles.assigneeList}>
              {assignees.map((assignee) => (
                <Pressable
                  key={assignee.id}
                  accessibilityRole="button"
                  disabled={isSavingOrder}
                  onPress={() => finalizeOrder(assignee)}
                  style={[styles.assigneeOption, { borderColor: theme.backgroundSelected }]}>
                  <View style={[styles.assigneeInitial, { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText style={styles.assigneeInitialText}>{assignee.name[0]?.toUpperCase()}</ThemedText>
                  </View>
                  <View style={styles.assigneeText}>
                    <ThemedText style={styles.assigneeName}>{assignee.name}</ThemedText>
                    <ThemedText themeColor="textSecondary" style={styles.assigneeRole}>{assignee.role === 'admin' ? 'Administrador' : 'Usuario'}</ThemedText>
                  </View>
                  {isSavingOrder ? <ActivityIndicator /> : null}
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" disabled={isSavingOrder} onPress={() => setIsAssigneeModalVisible(false)} style={styles.cancelButton}>
              <ThemedText themeColor="info" style={styles.cancelButtonText}>Cancelar</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>
      <Modal transparent animationType="slide" visible={isAddModalVisible} onRequestClose={() => setIsAddModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ThemedView type="backgroundElement" style={styles.assigneeModal}>
            <ThemedText style={styles.assigneeTitle}>{editingProduct ? 'Editar producto' : 'Nuevo producto'}</ThemedText>
            <Pressable accessibilityRole="button" onPress={chooseProductImage} style={[styles.imagePicker, { borderColor: theme.backgroundSelected }]}>
              {newImage || editingProduct?.imageUrl ? <Image cachePolicy="memory-disk" contentFit="cover" source={{ uri: newImage?.uri ?? editingProduct!.imageUrl! }} style={styles.newImagePreview} /> : <ThemedText themeColor="textSecondary">Seleccionar imagen</ThemedText>}
            </Pressable>
            <TextInput value={newName} onChangeText={setNewName} placeholder="Nombre" placeholderTextColor={theme.textSecondary} style={[styles.formInput, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
            <TextInput value={newDescription} onChangeText={setNewDescription} placeholder="Descripción" multiline placeholderTextColor={theme.textSecondary} style={[styles.formInput, styles.descriptionInput, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
            <View style={styles.supplierRow}>
              <Pressable onPress={() => setIsSupplierPickerVisible(true)} style={[styles.supplierPicker, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
                <ThemedText style={[styles.supplierPickerText, { color: newSupplierId ? theme.text : theme.textSecondary }]}>{suppliers.find((supplier) => supplier.id === newSupplierId)?.name ?? 'Seleccionar proveedor'}</ThemedText>
                <ThemedText style={[styles.supplierPickerIcon, { color: theme.textSecondary }]}>{symbolsLoaded ? 'expand_more' : '⌄'}</ThemedText>
              </Pressable>
              <Pressable accessibilityLabel="Añadir proveedor" onPress={() => setIsNewSupplierVisible(true)} style={[styles.newSupplierButton, { borderColor: theme.primary }]}>
                <ThemedText style={[styles.newSupplierButtonText, { color: theme.primary }]}>+ Nuevo</ThemedText>
              </Pressable>
            </View>
            <TextInput value={newPrice} onChangeText={setNewPrice} placeholder="Precio total" keyboardType="decimal-pad" placeholderTextColor={theme.textSecondary} style={[styles.formInput, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
            <View style={styles.unitToggleRow}>
              <TextInput value={newPackageQuantity} onChangeText={setNewPackageQuantity} keyboardType="decimal-pad" placeholder="Cantidad" placeholderTextColor={theme.textSecondary} style={[styles.packageInput, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
              <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>Unidades</ThemedText>
              <Switch
                accessibilityLabel="Cambiar contenido del producto entre unidades y libras"
                onValueChange={(isPound) => setNewUnitType(isPound ? 'pound' : 'unit')}
                trackColor={{ false: theme.backgroundSelected, true: theme.primary }}
                value={newUnitType === 'pound'}
              />
              <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>Libras</ThemedText>
            </View>
            <Pressable onPress={() => setIsCategoryPickerVisible(true)} style={[styles.categoryPicker, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
              <ThemedText style={styles.categoryPickerIcon}>{symbolsLoaded ? (categories.length ? categories : PRODUCT_CATEGORY_OPTIONS).find((category) => category.slug === newCategory)?.icon ?? 'category' : '•'}</ThemedText>
              <ThemedText style={[styles.categoryPickerText, { color: theme.text }]}>{(categories.length ? categories : PRODUCT_CATEGORY_OPTIONS).find((category) => category.slug === newCategory)?.name ?? 'Seleccionar categoría'}</ThemedText>
              <ThemedText style={[styles.supplierPickerIcon, { color: theme.textSecondary }]}>{symbolsLoaded ? 'expand_more' : '⌄'}</ThemedText>
            </Pressable>
            <View style={styles.categoryGrid}>{(categories.length ? categories : PRODUCT_CATEGORY_OPTIONS).map((category) => <Pressable key={category.slug} onPress={() => setNewCategory(category.slug)} style={[styles.categoryChip, { borderColor: theme.primary }, newCategory === category.slug && { backgroundColor: theme.primary }]}><ThemedText style={[styles.categoryChipIcon, newCategory === category.slug && styles.categoryChipTextSelected]}>{symbolsLoaded ? category.icon : '•'}</ThemedText><ThemedText style={[styles.categoryChipText, newCategory === category.slug && styles.categoryChipTextSelected]}>{category.name}</ThemedText></Pressable>)}</View>
            {error ? <ThemedText style={[styles.modalError, { color: theme.info }]}>{error}</ThemedText> : null}
            <Pressable disabled={isSavingProduct} onPress={saveProduct} style={[styles.checkoutButton, { backgroundColor: theme.primary }, isSavingProduct && styles.disabled]}>{isSavingProduct ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.checkoutButtonText}>{editingProduct ? 'Guardar cambios' : 'Guardar producto'}</ThemedText>}</Pressable>
            {editingProduct && canManageCatalog ? <Pressable disabled={isSavingProduct} onPress={() => confirmDeleteProduct(editingProduct)} style={styles.deleteButton}><ThemedText style={styles.deleteButtonText}>Eliminar producto</ThemedText></Pressable> : null}
            <Pressable disabled={isSavingProduct} onPress={() => { setIsAddModalVisible(false); setEditingProduct(null); }} style={styles.cancelButton}><ThemedText themeColor="info" style={styles.cancelButtonText}>Cancelar</ThemedText></Pressable>
          </ThemedView>
        </View>
      </Modal>
      <Modal transparent animationType="fade" visible={isSupplierPickerVisible} onRequestClose={() => setIsSupplierPickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ThemedView type="backgroundElement" style={styles.assigneeModal}>
            <ThemedText style={styles.assigneeTitle}>Seleccionar proveedor</ThemedText>
            <ScrollView contentContainerStyle={styles.supplierList}>
              {suppliers.map((supplier) => {
                const isSelected = supplier.id === newSupplierId;
                return (
                  <Pressable
                    key={supplier.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => { setNewSupplierId(supplier.id); setIsSupplierPickerVisible(false); }}
                    style={[styles.supplierOption, { borderBottomColor: theme.backgroundSelected }]}
                  >
                    <ThemedText style={[styles.supplierOptionName, isSelected && { color: theme.primary }]}>{supplier.name}</ThemedText>
                    <ThemedText style={[styles.supplierOptionCheck, { color: theme.primary }]}>{isSelected ? '✓' : ''}</ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => { setIsSupplierPickerVisible(false); setIsNewSupplierVisible(true); }} style={styles.cancelButton}><ThemedText style={[styles.cancelButtonText, { color: theme.primary }]}>Añadir proveedor nuevo</ThemedText></Pressable>
            <Pressable onPress={() => setIsSupplierPickerVisible(false)} style={styles.cancelButton}><ThemedText themeColor="info" style={styles.cancelButtonText}>Cancelar</ThemedText></Pressable>
          </ThemedView>
        </View>
      </Modal>
      <Modal transparent animationType="fade" visible={isCategoryPickerVisible} onRequestClose={() => setIsCategoryPickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ThemedView type="backgroundElement" style={styles.assigneeModal}>
            <ThemedText style={styles.assigneeTitle}>Seleccionar categoría</ThemedText>
            <ScrollView contentContainerStyle={styles.supplierList}>
              {(categories.length ? categories : PRODUCT_CATEGORY_OPTIONS).map((category) => {
                const isSelected = category.slug === newCategory;
                return (
                  <Pressable key={category.slug} accessibilityRole="radio" accessibilityState={{ selected: isSelected }} onPress={() => { setNewCategory(category.slug); setIsCategoryPickerVisible(false); }} style={[styles.supplierOption, { borderBottomColor: theme.backgroundSelected }]}>
                    <ThemedText style={[styles.categoryOptionIcon, isSelected && { color: theme.primary }]}>{symbolsLoaded ? category.icon : '•'}</ThemedText>
                    <ThemedText style={[styles.supplierOptionName, isSelected && { color: theme.primary }]}>{category.name}</ThemedText>
                    <ThemedText style={[styles.supplierOptionCheck, { color: theme.primary }]}>{isSelected ? '✓' : ''}</ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setIsCategoryPickerVisible(false)} style={styles.cancelButton}><ThemedText themeColor="info" style={styles.cancelButtonText}>Cancelar</ThemedText></Pressable>
          </ThemedView>
        </View>
      </Modal>
      <Modal transparent animationType="slide" visible={isNewSupplierVisible} onRequestClose={() => setIsNewSupplierVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ThemedView type="backgroundElement" style={styles.assigneeModal}>
            <ThemedText style={styles.assigneeTitle}>Nuevo proveedor</ThemedText>
            <TextInput value={supplierName} onChangeText={setSupplierName} placeholder="Nombre" placeholderTextColor={theme.textSecondary} style={[styles.formInput, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
            <TextInput value={supplierAddress} onChangeText={setSupplierAddress} placeholder="Dirección" placeholderTextColor={theme.textSecondary} style={[styles.formInput, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
            <TextInput value={supplierPhone} onChangeText={setSupplierPhone} placeholder="Teléfono" keyboardType="phone-pad" placeholderTextColor={theme.textSecondary} style={[styles.formInput, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
            <Pressable disabled={isSavingSupplier} onPress={saveSupplier} style={[styles.checkoutButton, { backgroundColor: theme.primary }, isSavingSupplier && styles.disabled]}>{isSavingSupplier ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.checkoutButtonText}>Guardar proveedor</ThemedText>}</Pressable>
            <Pressable onPress={() => router.push('/suppliers')} style={styles.cancelButton}><ThemedText themeColor="textSecondary" style={styles.cancelButtonText}>Gestionar proveedores</ThemedText></Pressable>
            <Pressable disabled={isSavingSupplier} onPress={() => setIsNewSupplierVisible(false)} style={styles.cancelButton}><ThemedText themeColor="info" style={styles.cancelButtonText}>Cancelar</ThemedText></Pressable>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

function ProductImage({ category, sourceUri }: { category: string; sourceUri: string | null }) {
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    setHasFailed(false);
  }, [sourceUri]);

  if (!sourceUri || hasFailed) {
    return <View style={styles.imageFallback}><ThemedText style={styles.imageFallbackText}>{category[0]?.toUpperCase()}</ThemedText></View>;
  }

  return <ImageZoomPreview accessibilityLabel="Ampliar imagen del producto" onError={() => setHasFailed(true)} sourceUri={sourceUri} style={styles.productImage} />;
}

function getDisplayName(user: NonNullable<ReturnType<typeof useAuth>['user']>) {
  return String(user.user_metadata.full_name ?? user.user_metadata.name ?? user.email?.split('@')[0] ?? 'Usuario');
}

function formatCategory(category: ProductCategory) {
  return category === 'carnicos' ? 'Cárnicos' : category.charAt(0).toUpperCase() + category.slice(1);
}

function formatUnit(unitType: ProductUnitType) {
  return unitType === 'pound' ? 'Por libra' : 'Por unidad';
}

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.00$/, '');
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FAF9F6', flex: 1 },
  safeArea: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  topBar: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  menuButton: { alignItems: 'center', borderRadius: Spacing.two, height: 44, justifyContent: 'center', width: 44 },
  menuIcon: { fontSize: 26, lineHeight: 28 },
  titleBlock: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  syncIndicator: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 3 },
  syncDot: { borderRadius: 4, height: 7, width: 7 },
  syncText: { fontSize: 10, fontWeight: '600' },
  cartControl: { alignItems: 'center', height: 40, justifyContent: 'center', position: 'relative', width: 40 },
  cartBadge: { alignItems: 'center', borderColor: '#FFFFFF', borderRadius: 10, borderWidth: 1.5, justifyContent: 'center', minWidth: 19, paddingHorizontal: 3, position: 'absolute', right: -1, top: -1 },
  cartBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', lineHeight: 17 },
  addCatalogButton: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  addCatalogButtonText: { color: '#FFFFFF', fontSize: 24, lineHeight: 26 },
  content: { alignSelf: 'center', flexGrow: 1, maxWidth: MaxContentWidth, padding: Spacing.three, paddingBottom: Spacing.four, width: '100%' },
  productScroll: { flex: 1 },
  productGrid: { gap: Spacing.two },
  categoryCarouselContainer: { flexGrow: 0, flexShrink: 0, height: 42, marginBottom: Spacing.two },
  categoryCarousel: { alignItems: 'center', gap: Spacing.one, paddingHorizontal: 1 },
  groupBySupplierControl: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: Spacing.one, marginBottom: Spacing.two, paddingVertical: Spacing.one },
  groupCheckbox: { alignItems: 'center', borderRadius: 4, borderWidth: 1.5, height: 18, justifyContent: 'center', width: 18 },
  groupCheckboxIcon: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', lineHeight: 15 },
  groupBySupplierText: { fontSize: 12, fontWeight: '700' },
  supplierGroupTitle: { fontSize: 13, fontWeight: '800', marginBottom: Spacing.one, marginTop: Spacing.one },
  filterChip: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  filterChipIcon: { fontFamily: 'MaterialSymbols', fontSize: 15, lineHeight: 16 },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  filterChipTextSelected: { color: '#FFFFFF' },
  emptyState: { paddingVertical: Spacing.four, textAlign: 'center' },
  productCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#EAE6DF', borderRadius: Spacing.three, borderWidth: StyleSheet.hairlineWidth, boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.04)', flexDirection: 'row', minHeight: 120, padding: Spacing.two },
  productImage: { borderRadius: Spacing.two, height: 96, width: 96 },
  imageFallback: { alignItems: 'center', backgroundColor: '#EEF1F3', borderRadius: Spacing.two, height: 96, justifyContent: 'center', width: 96 },
  imageFallbackText: { color: '#208AEF', fontSize: 26, fontWeight: '800' },
  productBody: { alignSelf: 'stretch', flex: 1, gap: 4, justifyContent: 'space-between', paddingLeft: Spacing.two },
  productHeader: { gap: Spacing.half, paddingTop: Spacing.half },
  productInfo: { flex: 1, minWidth: 0 },
  productName: { fontSize: 16, fontWeight: '800' },
  productUnit: { display: 'none' },
  inactiveProduct: { opacity: 0.52 },
  productDescription: { fontSize: 12, lineHeight: 16 },
  productDetails: { marginTop: Spacing.one },
  productPrice: { fontSize: 18, fontWeight: '800' },
  priceBlock: { alignItems: 'flex-start' },
  unitPrice: { fontSize: 12, marginTop: 1 },
  productFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  productActions: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, marginLeft: 'auto' },
  editButton: { paddingHorizontal: Spacing.one, paddingVertical: Spacing.one },
  editButtonText: { fontSize: 12, fontWeight: '700' },
  chevronButton: { alignItems: 'center', borderRadius: 15, borderWidth: 1, height: 30, justifyContent: 'center', marginLeft: Spacing.one, width: 30 },
  packageQuantity: { fontSize: 12, fontWeight: '700' },
  addButton: { alignItems: 'center', height: 30, justifyContent: 'center', width: 30 },
  quantityControl: { alignItems: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 30, overflow: 'hidden' },
  quantityButton: { alignItems: 'center', height: 28, justifyContent: 'center', width: 26 },
  quantityButtonIcon: { fontFamily: 'MaterialSymbols', fontSize: 18, lineHeight: 20, textAlign: 'center' },
  quantityValue: { fontSize: 13, fontWeight: '800', minWidth: 18, textAlign: 'center' },
  materialIcon: { fontFamily: 'MaterialSymbols', fontSize: 22, lineHeight: 24, textAlign: 'center' },
  feedback: { fontSize: 13, marginTop: Spacing.three, textAlign: 'center' },
  checkoutBar: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.three, justifyContent: 'space-between', padding: Spacing.three },
  checkoutLabel: { fontSize: 12 },
  checkoutTotal: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  checkoutButton: { alignItems: 'center', borderRadius: Spacing.two, height: 48, justifyContent: 'center', paddingHorizontal: Spacing.three },
  checkoutButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.86 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.42)', flex: 1, justifyContent: 'center', padding: Spacing.four },
  supplierRow: { flexDirection: 'row', gap: Spacing.two },
  supplierPicker: { alignItems: 'center', borderRadius: Spacing.two, borderWidth: 1, flex: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: Spacing.three },
  supplierPickerText: { flex: 1, fontSize: 14, fontWeight: '600' },
  supplierPickerIcon: { fontFamily: 'MaterialSymbols', fontSize: 22, lineHeight: 24, textAlign: 'center' },
  newSupplierButton: { alignItems: 'center', borderRadius: Spacing.two, borderWidth: 1, justifyContent: 'center', minWidth: 76, paddingHorizontal: Spacing.two },
  newSupplierButtonText: { fontSize: 13, fontWeight: '800' },
  supplierList: { paddingVertical: Spacing.one },
  supplierOption: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: Spacing.one },
  supplierOptionName: { flex: 1, fontSize: 15, fontWeight: '600' },
  supplierOptionCheck: { fontSize: 20, fontWeight: '800', minWidth: 24, textAlign: 'right' },
  assigneeModal: { borderRadius: Spacing.four, gap: Spacing.three, maxWidth: 420, padding: Spacing.four, width: '100%' },
  assigneeTitle: { fontSize: 21, fontWeight: '800' },
  assigneeCopy: { fontSize: 14, lineHeight: 20 },
  assigneeList: { gap: Spacing.two },
  assigneeOption: { alignItems: 'center', borderRadius: Spacing.two, borderWidth: 1, flexDirection: 'row', gap: Spacing.two, minHeight: 60, padding: Spacing.two },
  assigneeInitial: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  assigneeInitialText: { fontSize: 15, fontWeight: '800' },
  assigneeText: { flex: 1 },
  assigneeName: { fontSize: 15, fontWeight: '800' },
  assigneeRole: { fontSize: 12, marginTop: 2 },
  cancelButton: { alignItems: 'center', paddingVertical: Spacing.one },
  cancelButtonText: { fontSize: 15, fontWeight: '800' },
  imagePicker: { alignItems: 'center', borderRadius: Spacing.two, borderStyle: 'dashed', borderWidth: 1, height: 100, justifyContent: 'center', overflow: 'hidden' },
  newImagePreview: { height: '100%', width: '100%' },
  formInput: { borderRadius: Spacing.two, borderWidth: 1, fontSize: 16, minHeight: 48, paddingHorizontal: Spacing.two },
  descriptionInput: { minHeight: 82, paddingTop: Spacing.two, textAlignVertical: 'top' },
  categoryGrid: { display: 'none' },
  categoryPicker: { alignItems: 'center', borderRadius: Spacing.two, borderWidth: 1, flexDirection: 'row', minHeight: 50, paddingHorizontal: Spacing.three },
  categoryPickerIcon: { fontFamily: 'MaterialSymbols', fontSize: 19, lineHeight: 21, marginRight: Spacing.two },
  categoryPickerText: { flex: 1, fontSize: 14, fontWeight: '600' },
  categoryOptionIcon: { fontFamily: 'MaterialSymbols', fontSize: 18, lineHeight: 20, marginRight: Spacing.two },
  categoryChip: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  categoryChipIcon: { fontFamily: 'MaterialSymbols', fontSize: 15, lineHeight: 16 },
  categoryChipText: { fontSize: 12, fontWeight: '700' },
  categoryChipTextSelected: { color: '#FFFFFF' },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  unitToggleRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  packageInput: { borderRadius: Spacing.two, borderWidth: 1, fontSize: 15, height: 42, paddingHorizontal: Spacing.one, textAlign: 'center', width: 68 },
  modalError: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  deleteButton: { alignItems: 'center', paddingVertical: Spacing.one },
  deleteButtonText: { color: '#C2410C', fontSize: 14, fontWeight: '800' },
});
