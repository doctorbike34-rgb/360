export type UserRole = 'CYCLIST' | 'MECHANIC' | 'ADMIN' | 'PEER_MECHANIC';
export type UserPlan = 'MECHANIC_FREE' | 'BASE' | 'CLUB' | 'PRO';
export type PresenceStatus = 'ONLINE' | 'OFFLINE' | 'GHOST';
export type SOSStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';

export type KYCStatus = 'UNSUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type BadgeId = 'first_sos' | 'rescuer_5' | 'rescuer_25' | 'top_rated' | 'community_hero' | 'bike_doctor' | 'loyal_cyclist' | 'peer_pioneer';

export interface Badge {
  id: BadgeId;
  unlockedAt: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  plan: UserPlan;
  presenceStatus: PresenceStatus;
  lastLat?: number;
  lastLng?: number;
  avatarUrl?: string;
  photoURL?: string;
  balance: number;
  hasWelcomeGift: boolean;
  firstInterventionDiscount: number;
  sosPrice?: number; // Price set by mechanic
  isOnline?: boolean;
  phone?: string;
  bikeModel?: string;
  hasCompletedOnboarding?: boolean;
  lastLoginDate?: any;
  mechanicStatus?: string;
  
  kycStatus?: KYCStatus;
  kycDocuments?: {
    idUrl?: string;
    businessUrl?: string;
    vatNumber?: string;
    submittedAt?: any;
    rejectedReason?: string;
  };

  notificationsEnabled?: boolean;
  notificationPreferences?: {
    sosAlerts: boolean;
    newJobs: boolean;
    communityUpdates: boolean;
    marketing: boolean;
  };
  consents?: {
    privacyPolicy: boolean;
    termsOfService: boolean;
    dataProcessing: boolean;
    marketing: boolean;
  };
  locationName?: string;
  address?: string;
  
  // Peer Mechanic fields
  completedJobs?: number;
  peerMechanicEnabled?: boolean;
  peerMechanicRate?: number;
  peerMechanicRadius?: number; // in km
  peerMechanicSkills?: string[];
  peerMechanicEarnings?: number;
  peerMechanicJobsCompleted?: number;

  // Gamification fields
  points: number;
  badges: Badge[];
  weeklyPoints: number;
}

export interface MechanicProfile {
  businessName: string;
  radius: number;
  isAvailable: boolean;
  completedJobs: number;
  avgRating: number;
}

export interface SOSRequest {
  id: string;
  cyclistId: string;
  mechanicId?: string;
  status: SOSStatus;
  faultType: string;
  description: string;
  lat: number;
  lng: number;
  estimatedPrice?: number;
  createdAt: number;
  paymentStatus?: 'HELD' | 'RELEASED' | 'REFUNDED' | 'DISPUTED';
  mechanicConfirmed?: boolean;
  cyclistConfirmed?: boolean;
}

export interface InterventionRecord {
  id: string;
  sosId: string;
  date: number;
  cyclistId: string;
  cyclistName: string;
  mechanicId: string;
  mechanicName: string;
  mechanicType: UserRole;
  problemDescription: string;
  problemSeverity: string;
  location: { lat: number; lng: number };
  duration: number; // minutes
  cost: number;
  stripePaymentId?: string;
  status: 'completed' | 'disputed' | 'refunded';
  review?: {
    rating: number;
    comment: string;
  };
  aiDiagnosis?: string;
}

export type RoadReportCategory = 'pothole' | 'damaged_path' | 'obstacle' | 'missing_signage' | 'flooding' | 'other';
export type RoadReportSeverity = 'low' | 'medium' | 'high';
export type RoadReportStatus = 'open' | 'confirmed' | 'in_review' | 'resolved' | 'rejected';

export interface RoadReport {
  id: string;
  reporterId: string;
  reporterName: string;
  category: RoadReportCategory;
  description: string;
  severity: RoadReportSeverity;
  location: { lat: number; lng: number };
  photoUrl?: string;
  status: RoadReportStatus;
  upvotes: string[]; // array of userIds
  createdAt: number;
  updatedAt: number;
  adminNote?: string;
}
