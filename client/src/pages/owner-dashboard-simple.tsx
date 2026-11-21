// @ts-nocheck
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Home, Users, Calendar, Plus, MapPin, Star, Settings, Upload, Camera, Navigation, FileText, CheckCircle, AlertCircle, User, Edit, Trash2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import type { Property, Booking } from "@shared/schema";
import LocationAutocomplete from "@/components/location-autocomplete";
import { OwnerPaymentsTab, TenantInfo, TenantsAndBeds, tenantName } from "@/components/owner-parts";
import { geocodeAddress } from "@/lib/geocode";
import { RoomTypesEditor, RoomTypeList, emptyRoomType, priceLabel } from "@/components/room-types";
import { parseRoomTypes, aggregateRoomTypes, getRoomTypes, sharingLabel } from "@shared/roomtypes";
import { SUPPORTED_CITIES, normalizeCity, detectCity, isValidCoord } from "@shared/cities";

export default function OwnerDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [addPropertyDialog, setAddPropertyDialog] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addedTypes, setAddedTypes] = useState<any[]>([]);
  const [newProperty, setNewProperty] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    rent: "",
    securityDeposit: "",
    roomTypes: [emptyRoomType("1")] as any[],
    totalRooms: "",
    totalBeds: "",
    availableBeds: "",
    gender: "",
    description: "",
    amenities: [],
    latitude: "",
    longitude: "",
    images: [] as string[],
    ownerDocuments: {
      aadhar: null as File | null,
      license: null as File | null
    }
  });
  
  const [currentStep, setCurrentStep] = useState(1);
  const [locationMethod, setLocationMethod] = useState<"current" | "manual">("current");
  const [locationLoading, setLocationLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});

  // Helper functions
  const handleFileUpload = (type: 'aadhar' | 'license' | 'image', file: File) => {
    if (type === 'image') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        setNewProperty(prev => ({
          ...prev,
          images: [...prev.images, imageUrl]
        }));
      };
      reader.readAsDataURL(file);
    } else {
      setNewProperty(prev => ({
        ...prev,
        ownerDocuments: {
          ...prev.ownerDocuments,
          [type]: file
        }
      }));
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation Not Supported",
        description: "Your browser doesn't support geolocation. Please set location manually.",
        variant: "destructive",
      });
      return;
    }

    setLocationLoading(true);
    toast({
      title: "Getting Location",
      description: "Please allow location access when prompted...",
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        
        setNewProperty(prev => ({
          ...prev,
          latitude: lat,
          longitude: lng
        }));
        
        setLocationLoading(false);
        toast({
          title: "Location Set Successfully",
          description: `Coordinates: ${lat}, ${lng}`,
        });
      },
      (error) => {
        setLocationLoading(false);
        let errorMessage = "Unable to get current location. Please set manually.";
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location access denied. Please enable location permissions and try again.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information unavailable. Please set manually.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out. Please try again or set manually.";
            break;
        }
        
        toast({
          title: "Location Error",
          description: errorMessage,
          variant: "destructive",
        });
        
        // Switch to manual mode if location fails
        setLocationMethod("manual");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  const nextStep = () => {
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  // Fetch owner's properties
  const { data: properties = [], isLoading: propertiesLoading } = useQuery({
    queryKey: [`/api/properties/owner/${user?.id}`],
    enabled: !!user?.id,
  });

  console.log("Owner properties data:", properties, "User ID:", user?.id);

  // Fetch owner's bookings
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: [`/api/bookings/owner/${user?.id}`],
    enabled: !!user?.id,
  }) as { data: Booking[], isLoading: boolean };

  const totalProperties = properties.length;
  const verifiedProperties = properties.filter((p: any) => p.isVerified).length;
  const pendingBookings = bookings.filter((b: any) => b.status === "pending").length;
  // Revenue is built only from approved tenants (each at the rent that was booked)
  // and from payments the owner has actually approved.
  const approvedTenants = bookings.filter((b: any) => b.status === "approved");
  const monthlyRevenue = approvedTenants.reduce((sum: number, b: any) => sum + Number(b.rent || 0), 0);
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const { data: ownerPayments = [] } = useQuery({
    queryKey: [`/api/rent-payments/owner/${user?.id}`],
    enabled: !!user?.id,
  }) as { data: any[] };
  const collectedThisMonth = ownerPayments
    .filter((p: any) => p.status === "paid" && p.paymentMonth === currentMonth)
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const awaitingApproval = ownerPayments.filter((p: any) => p.status === "submitted").length;

  // Booking action handlers
  const handleBookingAction = (bookingId: number, status: string) => {
    updateBookingMutation.mutate({ id: bookingId, status });
  };
  const handleRemoveTenant = (booking: any) => {
    if (window.confirm(`Remove ${tenantName(booking)} from ${booking.propertyName}? Their bed becomes available again.`)) {
      updateBookingMutation.mutate({ id: booking.id, status: "removed" });
    }
  };
  const createPropertyMutation = useMutation({
    mutationFn: async (propertyData: any) => {
      const response = await apiRequest("POST", "/api/properties", propertyData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Property Added",
        description: "Your property has been successfully added and is pending verification.",
      });
      // Invalidate multiple related queries
      queryClient.invalidateQueries({ queryKey: [`/api/properties/owner/${user?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
      setAddPropertyDialog(false);
      setCurrentStep(1);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add property. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Booking status update mutation
  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await apiRequest("PATCH", `/api/bookings/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Booking Updated",
        description: "Booking status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/owner/${user?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/owner/${user?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update booking. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update property mutation
  const updatePropertyMutation = useMutation({
    mutationFn: async (propertyData: any) => {
      const response = await apiRequest("PUT", `/api/properties/${propertyData.id}`, propertyData);
      return response.json();
    },
    onSuccess: (updated) => {
      if (updated?.id) setSelectedProperty(updated);
      setAddedTypes([]);
      toast({
        title: "Property Updated",
        description: "Your property has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/owner/${user?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
      setEditMode(false);
      setManageDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update property. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete property mutation
  const deletePropertyMutation = useMutation({
    mutationFn: async (propertyId: number) => {
      const response = await apiRequest("DELETE", `/api/properties/${propertyId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Property Deleted",
        description: "Your property has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/owner/${user?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
      setManageDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete property. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setNewProperty({
      name: "",
      address: "",
      city: "",
      state: "",
      pincode: "",
      rent: "",
      securityDeposit: "",
      roomTypes: [emptyRoomType("1")] as any[],
      totalRooms: "",
      totalBeds: "",
      availableBeds: "",
      gender: "",
      description: "",
      amenities: [],
      latitude: "",
      longitude: "",
      images: [] as string[],
      ownerDocuments: {
        aadhar: null as File | null,
        license: null as File | null
      }
    });
  };

  // Helper functions for property management
  const openManageDialog = (property: any) => {
    setSelectedProperty(property);
    setEditFormData(property);
    setEditMode(false);
    setManageDialogOpen(true);
  };

  const startEditMode = () => {
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditFormData(selectedProperty);
  };

  useEffect(() => {
    setAddedTypes([]);
  }, [selectedProperty?.id]);

  const savePropertyChanges = async () => {
    const f = editFormData;
    const existing = getRoomTypes(f);
    if (existing.length === 0 && addedTypes.length === 0 && !(Number(f.rent) > 0)) {
      toast({ title: "Invalid rent", description: "Rent must be greater than 0.", variant: "destructive" });
      return;
    }
    const payload: any = {
      id: f.id,
      name: f.name,
      city: normalizeCity(f.city),
      address: f.address,
      description: f.description,
      gender: f.gender,
    };
    if (existing.length > 0 || addedTypes.length > 0) {
      const merged = [...existing, ...addedTypes];
      // existing types are validated by the server too; check new rows here for a clear message
      if (addedTypes.length > 0) {
        const check = parseRoomTypes(addedTypes);
        if (check.error) {
          toast({ title: "Room types", description: check.error, variant: "destructive" });
          return;
        }
      }
      payload.roomTypes = merged;
    } else {
      payload.rent = Number(f.rent);
      payload.securityDeposit = Number(f.securityDeposit || 0);
    }
    // If the address changed, re-pin it on the map
    if (f.address !== selectedProperty.address || normalizeCity(f.city) !== normalizeCity(selectedProperty.city)) {
      const found = await geocodeAddress({ address: f.address, city: f.city, state: f.state, pincode: f.pincode });
      if (found) {
        payload.latitude = found.lat;
        payload.longitude = found.lng;
      } else {
        toast({
          title: "Map pin not updated",
          description: "The new address could not be found on the map, so the old pin was kept.",
        });
      }
    }
    updatePropertyMutation.mutate(payload);
  };

  const deleteProperty = () => {
    if (window.confirm("Are you sure you want to delete this property? This action cannot be undone.")) {
      deletePropertyMutation.mutate(selectedProperty.id);
    }
  };

  const handleAddProperty = async () => {
    const np = newProperty;
    const fail = (title: string, description: string) =>
      toast({ title, description, variant: "destructive" });

    if (!np.name || !np.city || !np.address || !np.totalRooms || !np.gender) {
      return fail("Missing Information", "Please fill in all required fields.");
    }
    const parsedTypes = parseRoomTypes(np.roomTypes);
    if (parsedTypes.error) return fail("Room types", parsedTypes.error);
    if (!np.ownerDocuments.aadhar || !np.ownerDocuments.license) {
      return fail("Missing Documents", "Please upload both Aadhar card and property license.");
    }
    if (np.images.length === 0) {
      return fail("Missing Photos", "Please upload at least one property photo.");
    }

    // Every PG needs a real map pin: use what the owner set, otherwise look it up
    let latitude = np.latitude;
    let longitude = np.longitude;
    if (!isValidCoord(latitude, longitude)) {
      toast({ title: "Finding location…", description: "Looking up your address on the map." });
      const found = await geocodeAddress({ address: np.address, city: np.city, state: np.state, pincode: np.pincode });
      if (!found) {
        return fail(
          "Location not found",
          "We could not place this address on the map. Pick it from the address suggestions, use 'current location', or enter latitude/longitude in the location step.",
        );
      }
      latitude = found.lat;
      longitude = found.lng;
    }

    createPropertyMutation.mutate({
      name: np.name.trim(),
      address: np.address.trim(),
      city: normalizeCity(np.city),
      state: np.state,
      pincode: np.pincode,
      roomTypes: parsedTypes.types,
      totalRooms: parseInt(np.totalRooms),
      gender: np.gender,
      description: np.description,
      amenities: np.amenities,
      latitude,
      longitude,
      images: np.images,
    });
  };

  const handleCancelBooking = async (bookingId: number) => {
    if (window.confirm("Are you sure you want to cancel this booking? This action cannot be undone.")) {
      try {
        const response = await apiRequest("DELETE", `/api/bookings/${bookingId}`);
        if (response.ok) {
          toast({
            title: "Booking Cancelled",
            description: "The booking has been cancelled successfully.",
          });
          queryClient.invalidateQueries({ queryKey: [`/api/bookings/owner/${user?.id}`] });
          queryClient.invalidateQueries({ queryKey: [`/api/properties/owner/${user?.id}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to cancel booking. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Owner Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-300 mt-2">
                Welcome back, Owner! Manage your properties and bookings.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                onClick={() => setLocation('/settings')}
                className="flex items-center"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
              <Home className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProperties}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verified Properties</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{verifiedProperties}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingBookings}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{monthlyRevenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {approvedTenants.length} tenant{approvedTenants.length === 1 ? "" : "s"} • collected this month ₹{collectedThisMonth.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="properties">Properties</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="payments">
              Payments{awaitingApproval > 0 ? ` (${awaitingApproval})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Properties */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Properties</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {properties.slice(0, 3).map((property) => (
                      <div key={property.id} className="flex items-center space-x-4">
                        <img
                          src={property.images?.[0] || "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=200&h=120&fit=crop"}
                          alt={property.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        <div className="flex-1">
                          <p className="font-medium">{property.name}</p>
                          <p className="text-sm text-gray-500">{property.city}</p>
                        </div>
                        <Badge variant={property.isVerified ? "default" : "secondary"}>
                          {property.isVerified ? "Verified" : "Pending"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Bookings */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Booking Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {bookings.slice(0, 3).map((booking) => {
                      return (
                        <div key={booking.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                <User className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{tenantName(booking)}</p>
                                <p className="text-sm text-gray-500">{booking.propertyName}</p>
                                <p className="text-xs text-gray-400">₹{booking.rent}/month • {booking.userEmail}</p>
                              </div>
                            </div>
                          </div>
                          <Badge 
                            variant={
                              booking.status === "pending" ? "outline" :
                              booking.status === "approved" ? "default" : "destructive"
                            }
                          >
                            {booking.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="properties" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">My Properties</h2>
              <Button onClick={() => setAddPropertyDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Property
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {properties.map((property) => (
                <Card key={property.id}>
                  <div className="aspect-video relative">
                    <img
                      src={property.images?.[0] || "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=200&h=120&fit=crop"}
                      alt={property.name}
                      className="w-full h-full object-cover rounded-t-lg"
                    />
                    <Badge 
                      className="absolute top-2 right-2"
                      variant={property.isVerified ? "default" : "secondary"}
                    >
                      {property.isVerified ? "Verified" : "Pending"}
                    </Badge>
                  </div>
                  <CardHeader>
                    <CardTitle className="text-lg">{property.name}</CardTitle>
                    <div className="flex items-center text-sm text-gray-500">
                      <MapPin className="w-4 h-4 mr-1" />
                      {property.city}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold">{priceLabel(property)}/month</span>
                      <Badge variant="outline">{property.gender}</Badge>
                    </div>
                    {getRoomTypes(property).length > 0 ? (
                      <RoomTypeList property={property} compact />
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">
                        Deposit ₹{Number(property.securityDeposit || 0).toLocaleString()}
                      </p>
                    )}
                    <p className={`text-sm mt-2 ${property.availableBeds > 0 ? "text-green-600" : "text-red-600"}`}>
                      {property.availableBeds} of {property.totalBeds} beds available •{" "}
                      {approvedTenants.filter((b: any) => b.propertyId === property.id).length} tenant(s)
                    </p>
                    <Button 
                      className="w-full mt-4" 
                      variant="outline"
                      onClick={() => openManageDialog(property)}
                    >
                      Manage
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="bookings" className="space-y-6">
            <h2 className="text-2xl font-bold">Booking Requests</h2>

            {bookings.length === 0 && (
              <p className="text-gray-500">No booking requests yet.</p>
            )}

            <div className="space-y-4">
              {[...bookings]
                .sort((a: any, b: any) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0))
                .map((booking: any) => {
                  const property = properties.find((p: any) => p.id === booking.propertyId);
                  return (
                    <Card key={booking.id}>
                      <CardContent className="pt-6">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="flex items-start space-x-4">
                            <img
                              src={property?.images?.[0] || "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=200&h=120&fit=crop"}
                              alt={booking.propertyName}
                              className="w-16 h-16 rounded-lg object-cover"
                            />
                            <div className="space-y-2">
                              <div>
                                <h3 className="font-semibold">{booking.propertyName}</h3>
                                <p className="text-sm text-gray-500">{booking.propertyCity}</p>
                                <p className="text-sm font-medium">
                                  {booking.sharing ? `${sharingLabel(booking.sharing)} • ` : ""}₹{Number(booking.rent).toLocaleString()}/month • Deposit ₹{Number(booking.securityDeposit || 0).toLocaleString()}
                                </p>
                                {booking.moveInDate && (
                                  <p className="text-xs text-gray-500">
                                    {new Date(booking.moveInDate).toLocaleDateString()}
                                    {booking.moveOutDate ? ` → ${new Date(booking.moveOutDate).toLocaleDateString()}` : ""}
                                  </p>
                                )}
                              </div>
                              <div className="border-l-2 pl-3">
                                <TenantInfo booking={booking} />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant={
                                booking.status === "pending" ? "outline" :
                                booking.status === "approved" ? "default" : "destructive"
                              }
                            >
                              {{ pending: "Needs your decision", approved: "Approved tenant", rejected: "Rejected", removed: "Removed" }[booking.status as string] || booking.status}
                            </Badge>

                            {booking.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleBookingAction(booking.id, "approved")}
                                  disabled={updateBookingMutation.isPending}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleBookingAction(booking.id, "rejected")}
                                  disabled={updateBookingMutation.isPending}
                                >
                                  Reject
                                </Button>
                              </>
                            )}

                            {booking.status === "approved" && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRemoveTenant(booking)}
                                disabled={updateBookingMutation.isPending}
                              >
                                Remove tenant
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </TabsContent>

          <TabsContent value="payments" className="space-y-6">
            <h2 className="text-2xl font-bold">Rent Payments</h2>
            <p className="text-sm text-gray-500">
              Tenants mark a month as paid (cash or online). Approve it once you have received the money.
            </p>
            <OwnerPaymentsTab ownerId={user?.id} />
          </TabsContent>
        </Tabs>

        {/* Enhanced Add Property Dialog */}
        <Dialog open={addPropertyDialog} onOpenChange={setAddPropertyDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Property - Step {currentStep} of 4</DialogTitle>
              <DialogDescription>
                {currentStep === 1 && "Upload your verification documents"}
                {currentStep === 2 && "Fill in property details and room information"}
                {currentStep === 3 && "Set location and upload property photos"}
                {currentStep === 4 && "Review and submit your property"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              {/* Step 1: Document Upload */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Owner Verification Documents</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label>Aadhar Card</Label>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 mb-2">
                          {newProperty.ownerDocuments.aadhar ? 
                            newProperty.ownerDocuments.aadhar.name : 
                            "Upload Aadhar Card"
                          }
                        </p>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload('aadhar', file);
                          }}
                          className="hidden"
                          id="aadhar-upload"
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => document.getElementById('aadhar-upload')?.click()}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Choose File
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <Label>Property License/Registration</Label>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 mb-2">
                          {newProperty.ownerDocuments.license ? 
                            newProperty.ownerDocuments.license.name : 
                            "Upload License/Registration"
                          }
                        </p>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload('license', file);
                          }}
                          className="hidden"
                          id="license-upload"
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => document.getElementById('license-upload')?.click()}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Choose File
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Property Details */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Property Details</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Property Name</Label>
                      <Input
                        id="name"
                        value={newProperty.name}
                        onChange={(e) => setNewProperty({...newProperty, name: e.target.value})}
                        placeholder="Green Valley PG"
                      />
                    </div>
                    <div>
                      <Label htmlFor="city">City</Label>
                      <Select value={newProperty.city} onValueChange={(value) => setNewProperty({...newProperty, city: value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select city" />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_CITIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={newProperty.state}
                        onChange={(e) => setNewProperty({...newProperty, state: e.target.value})}
                        placeholder="Karnataka"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pincode">Pincode</Label>
                      <Input
                        id="pincode"
                        value={newProperty.pincode}
                        onChange={(e) => setNewProperty({...newProperty, pincode: e.target.value})}
                        placeholder="560001"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="address">Complete Address</Label>
                    <LocationAutocomplete
                      id="address"
                      value={newProperty.address}
                      onChange={(v) => setNewProperty({ ...newProperty, address: v })}
                      onSelect={(s) => {
                        setNewProperty((prev) => ({
                          ...prev,
                          address: s.display,
                          // only accept a city we recognise ("Koramangala" is an area, not the city)
                          city: detectCity(s.display) || detectCity(s.city) || prev.city,
                          state: s.state || prev.state,
                          pincode: s.postcode || prev.pincode,
                          latitude: s.lat || prev.latitude,
                          longitude: s.lon || prev.longitude,
                        }));
                      }}
                      placeholder="Start typing address, area, landmark…"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="totalRooms">Total Rooms</Label>
                      <Input
                        id="totalRooms"
                        type="number"
                        value={newProperty.totalRooms}
                        onChange={(e) => setNewProperty({...newProperty, totalRooms: e.target.value})}
                        placeholder="10"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gender">Gender Preference</Label>
                      <Select value={newProperty.gender} onValueChange={(value) => setNewProperty({...newProperty, gender: value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="any">Any</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <RoomTypesEditor
                    value={newProperty.roomTypes}
                    onChange={(roomTypes) => setNewProperty({...newProperty, roomTypes})}
                  />

                  <div>
                    <Label htmlFor="description">Property Description</Label>
                    <Textarea
                      id="description"
                      value={newProperty.description}
                      onChange={(e) => setNewProperty({...newProperty, description: e.target.value})}
                      placeholder="Describe your property, amenities, rules, and nearby facilities..."
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Location & Photos */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Location & Photos</h3>
                  
                  <div className="space-y-4">
                    <Label>Set Property Location</Label>
                    <div className="flex gap-4">
                      <Button 
                        variant={locationMethod === "current" ? "default" : "outline"}
                        onClick={() => {
                          setLocationMethod("current");
                          getCurrentLocation();
                        }}
                        disabled={locationLoading}
                      >
                        {locationLoading ? (
                          <div className="w-4 h-4 mr-2 animate-spin border-2 border-white border-t-transparent rounded-full" />
                        ) : (
                          <Navigation className="w-4 h-4 mr-2" />
                        )}
                        {locationLoading ? "Getting Location..." : "Use Current Location"}
                      </Button>
                      <Button 
                        variant={locationMethod === "manual" ? "default" : "outline"}
                        onClick={() => setLocationMethod("manual")}
                        disabled={locationLoading}
                      >
                        <MapPin className="w-4 h-4 mr-2" />
                        Set Manually
                      </Button>
                    </div>
                    
                    {newProperty.latitude && newProperty.longitude && (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                        <p className="text-sm text-green-700 dark:text-green-300">
                          📍 Location set: {newProperty.latitude}, {newProperty.longitude}
                        </p>
                      </div>
                    )}
                    
                    {locationMethod === "manual" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="latitude">Latitude</Label>
                          <Input
                            id="latitude"
                            value={newProperty.latitude}
                            onChange={(e) => setNewProperty({...newProperty, latitude: e.target.value})}
                            placeholder="12.9716"
                          />
                        </div>
                        <div>
                          <Label htmlFor="longitude">Longitude</Label>
                          <Input
                            id="longitude"
                            value={newProperty.longitude}
                            onChange={(e) => setNewProperty({...newProperty, longitude: e.target.value})}
                            placeholder="77.5946"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <Label>Property Photos</Label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 mb-2">Upload property photos</p>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          files.forEach(file => handleFileUpload('image', file));
                        }}
                        className="hidden"
                        id="image-upload"
                      />
                      <Button 
                        variant="outline" 
                        onClick={() => document.getElementById('image-upload')?.click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Choose Photos
                      </Button>
                    </div>
                    
                    {newProperty.images.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {newProperty.images.map((image, index) => (
                          <div key={index} className="relative">
                            <img 
                              src={image} 
                              alt={`Property ${index + 1}`}
                              className="w-full h-24 object-cover rounded-lg"
                            />
                            <Button
                              size="sm"
                              variant="destructive"
                              className="absolute top-1 right-1 h-6 w-6 p-0"
                              onClick={() => {
                                setNewProperty(prev => ({
                                  ...prev,
                                  images: prev.images.filter((_, i) => i !== index)
                                }));
                              }}
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Preview & Review */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Preview Your Property Listing</h3>
                  
                  {/* Property Preview Card */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
                    {/* Property Images Carousel */}
                    {newProperty.images.length > 0 && (
                      <div className="relative h-64 bg-gray-100">
                        <img 
                          src={newProperty.images[0]} 
                          alt="Property preview"
                          className="w-full h-full object-cover"
                        />
                        {newProperty.images.length > 1 && (
                          <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                            1 of {newProperty.images.length} photos
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="text-xl font-bold text-gray-900 dark:text-white">{newProperty.name}</h4>
                          <p className="text-gray-600 dark:text-gray-300 flex items-center mt-1">
                            <MapPin className="w-4 h-4 mr-1" />
                            {newProperty.address}, {newProperty.city}
                          </p>
                        </div>
                        <div className="text-right">
                          {(() => {
                            const pt = parseRoomTypes(newProperty.roomTypes);
                            return pt.types ? (
                              <div className="text-2xl font-bold text-emerald-600">
                                {pt.types.length > 1 ? "From " : ""}₹{aggregateRoomTypes(pt.types).rent.toLocaleString()}/month
                              </div>
                            ) : (
                              <div className="text-sm text-amber-600">Complete the room types</div>
                            );
                          })()}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="text-center">
                          <div className="font-semibold text-gray-900 dark:text-white">{newProperty.totalRooms}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Total Rooms</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-gray-900 dark:text-white">{parseRoomTypes(newProperty.roomTypes).types?.reduce((t, x) => t + x.totalBeds, 0) ?? "-"}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Total Beds</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-gray-900 dark:text-white">{parseRoomTypes(newProperty.roomTypes).types?.reduce((t, x) => t + x.availableBeds, 0) ?? "-"}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Available</div>
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <Badge variant="outline" className="mr-2">{newProperty.gender} only</Badge>
                        <Badge variant="secondary">Pending Verification</Badge>
                      </div>
                      
                      {newProperty.description && (
                        <div className="mb-4">
                          <h5 className="font-medium mb-2 text-gray-900 dark:text-white">Description</h5>
                          <p className="text-gray-600 dark:text-gray-300 text-sm">{newProperty.description}</p>
                        </div>
                      )}
                      
                      {/* Location Preview */}
                      {newProperty.latitude && newProperty.longitude && (
                        <div className="mb-4">
                          <h5 className="font-medium mb-2 text-gray-900 dark:text-white">Location</h5>
                          <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 text-center">
                            <MapPin className="w-6 h-6 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                              Coordinates: {parseFloat(newProperty.latitude).toFixed(4)}, {parseFloat(newProperty.longitude).toFixed(4)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Map will be displayed on the live listing</p>
                          </div>
                        </div>
                      )}
                      
                      {/* Documents Status */}
                      <div className="border-t pt-4">
                        <h5 className="font-medium mb-2 text-gray-900 dark:text-white">Verification Documents</h5>
                        <div className="flex gap-4">
                          <div className="flex items-center">
                            {newProperty.ownerDocuments.aadhar ? (
                              <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-500 mr-1" />
                            )}
                            <span className="text-sm text-gray-700 dark:text-gray-300">Aadhar Card</span>
                          </div>
                          <div className="flex items-center">
                            {newProperty.ownerDocuments.license ? (
                              <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-500 mr-1" />
                            )}
                            <span className="text-sm text-gray-700 dark:text-gray-300">Property License</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Summary Information */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h5 className="font-medium text-blue-800 mb-2">What happens next?</h5>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• Your property will be submitted for verification</li>
                      <li>• Our team will review your documents within 24-48 hours</li>
                      <li>• Once approved, your listing will be visible to potential tenants</li>
                      <li>• You'll receive booking requests through your owner dashboard</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-4">
                <div>
                  {currentStep > 1 && (
                    <Button variant="outline" onClick={prevStep}>
                      Previous
                    </Button>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setAddPropertyDialog(false)}>
                    Cancel
                  </Button>
                  
                  {currentStep < 4 ? (
                    <Button onClick={nextStep}>
                      Next
                    </Button>
                  ) : (
                    <Button onClick={handleAddProperty}>
                      Submit Property
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Property Management Dialog */}
        <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Property: {selectedProperty?.name}</DialogTitle>
            </DialogHeader>
            {selectedProperty && !editMode && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Property Name</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{selectedProperty.name}</p>
                  </div>
                  <div>
                    <Label>Location</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{selectedProperty.city}, {selectedProperty.state}</p>
                  </div>
                  <div>
                    <Label>Total Beds</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{selectedProperty.totalBeds}</p>
                  </div>
                  <div>
                    <Label>Available Beds</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{selectedProperty.availableBeds}</p>
                  </div>
                  {getRoomTypes(selectedProperty).length > 0 ? (
                    <div className="col-span-2">
                      <Label>Room types</Label>
                      <RoomTypeList property={selectedProperty} />
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label>Rent</Label>
                        <p className="text-sm text-gray-600 dark:text-gray-300">₹{Number(selectedProperty.rent).toLocaleString()}/month</p>
                      </div>
                      <div>
                        <Label>Security Deposit</Label>
                        <p className="text-sm text-gray-600 dark:text-gray-300">₹{Number(selectedProperty.securityDeposit || 0).toLocaleString()}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <Label>Gender Preference</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{selectedProperty.gender}</p>
                  </div>
                </div>
                
                <div>
                  <Label>Description</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{selectedProperty.description}</p>
                </div>

                <div>
                  <Label>Address</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{selectedProperty.address}</p>
                </div>

                <TenantsAndBeds
                  property={selectedProperty}
                  bookings={bookings}
                  onPropertyChange={(p) => {
                    setSelectedProperty(p);
                    setEditFormData(p);
                  }}
                />

                <div className="flex gap-2 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setManageDialogOpen(false)}
                  >
                    Close
                  </Button>
                  <Button 
                    variant="default"
                    onClick={startEditMode}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Property
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={deleteProperty}
                    disabled={deletePropertyMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deletePropertyMutation.isPending ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            )}

            {selectedProperty && editMode && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Property Name</Label>
                    <Input
                      value={editFormData.name || ''}
                      onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Select
                      value={normalizeCity(editFormData.city) || undefined}
                      onValueChange={(value) => setEditFormData({...editFormData, city: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...new Set([...SUPPORTED_CITIES, normalizeCity(editFormData.city)].filter(Boolean))].map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {getRoomTypes(editFormData).length > 0 ? (
                    <div className="col-span-2 space-y-3">
                      <Label>Prices per room type</Label>
                      {getRoomTypes(editFormData).map((t) => (
                        <div key={t.sharing} className="grid grid-cols-3 gap-3 items-end border rounded-lg p-3">
                          <div className="text-sm font-medium">{sharingLabel(t.sharing)}</div>
                          <div>
                            <Label className="text-xs">Rent / bed (₹)</Label>
                            <Input
                              type="number"
                              min={1}
                              value={t.rent}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  roomTypes: getRoomTypes(editFormData).map((x) =>
                                    x.sharing === t.sharing ? { ...x, rent: parseInt(e.target.value) || 0 } : x,
                                  ),
                                })
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Deposit (₹)</Label>
                            <Input
                              type="number"
                              min={0}
                              value={t.securityDeposit}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  roomTypes: getRoomTypes(editFormData).map((x) =>
                                    x.sharing === t.sharing ? { ...x, securityDeposit: parseInt(e.target.value) || 0 } : x,
                                  ),
                                })
                              }
                            />
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-gray-500">
                        New prices apply to new bookings. Current tenants keep the rent they booked at.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label>Rent (₹/month)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={editFormData.rent ?? ''}
                          onChange={(e) => setEditFormData({...editFormData, rent: parseInt(e.target.value) || 0})}
                        />
                      </div>
                      <div>
                        <Label>Security Deposit (₹)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={editFormData.securityDeposit ?? ''}
                          onChange={(e) => setEditFormData({...editFormData, securityDeposit: parseInt(e.target.value) || 0})}
                        />
                      </div>
                    </>
                  )}
                  <div className="col-span-2">
                    <RoomTypesEditor
                      title={getRoomTypes(editFormData).length > 0 ? "Add another room type" : "Switch to room types (1/2/3 sharing)"}
                      value={addedTypes}
                      onChange={setAddedTypes}
                      taken={getRoomTypes(editFormData).map((t) => t.sharing)}
                      allowEmpty
                    />
                  </div>
                  <div>
                    <Label>Gender Preference</Label>
                    <Select 
                      value={editFormData.gender} 
                      onValueChange={(value) => setEditFormData({...editFormData, gender: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="any">Any</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={editFormData.description || ''}
                    onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Address</Label>
                  <Input
                    value={editFormData.address || ''}
                    onChange={(e) => setEditFormData({...editFormData, address: e.target.value})}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={cancelEdit}
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="default"
                    onClick={savePropertyChanges}
                    disabled={updatePropertyMutation.isPending}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updatePropertyMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}