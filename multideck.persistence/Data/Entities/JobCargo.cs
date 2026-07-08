using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobCargo
{
    public Guid JobCargoId { get; set; }

    public Guid? JobCargoJobId { get; set; }

    public string? JobCargoCommodity { get; set; }

    public decimal? JobCargoQty { get; set; }

    public decimal? JobCargoHeight { get; set; }

    public decimal? JobCargoWidth { get; set; }

    public decimal? JobCargoLength { get; set; }

    public decimal? JobCargoGrossKilos { get; set; }

    public decimal? JobCargoNettKilos { get; set; }

    public bool JobCargoPacked { get; set; }

    public int? JobCargoLineNo { get; set; }

    public string? JobCargoDescription { get; set; }

    public Guid? JobCargoPackageTypeId { get; set; }

    public string? JobCargoPackageTypeCodeSnapshot { get; set; }

    public decimal? JobCargoPackageQty { get; set; }

    public string? JobCargoMarksNumbers { get; set; }

    public string? JobCargoHscode { get; set; }

    public string? JobCargoCountryOfOriginCodeSnapshot { get; set; }

    public decimal? JobCargoVolumeCbm { get; set; }

    public string JobCargoLengthUnit { get; set; } = null!;

    public string JobCargoWeightUnit { get; set; } = null!;

    public string JobCargoVolumeUnit { get; set; } = null!;

    public decimal? JobCargoDeclaredValueAmount { get; set; }

    public Guid? JobCargoDeclaredValueCurrencyId { get; set; }

    public string? JobCargoDeclaredValueCurrencyCodeSnapshot { get; set; }

    public bool JobCargoIsHazardous { get; set; }

    public bool JobCargoIsTemperatureControlled { get; set; }

    public bool? JobCargoIsStackable { get; set; }

    public string JobCargoCargoJson { get; set; } = null!;

    public DateTime JobCargoCreatedAt { get; set; }

    public DateTime JobCargoUpdatedAt { get; set; }

    public Guid? JobCargoUpdatedBy { get; set; }

    public bool JobCargoIsDeleted { get; set; }

    public virtual ICollection<AwbGoodsItem> AwbGoodsItems { get; set; } = new List<AwbGoodsItem>();

    public virtual ICollection<BlGoodsItem> BlGoodsItems { get; set; } = new List<BlGoodsItem>();

    public virtual ICollection<CdsItem> CdsItems { get; set; } = new List<CdsItem>();

    public virtual ICollection<ClmClaim> ClmClaims { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmIncidentCargoItem> ClmIncidentCargoItems { get; set; } = new List<ClmIncidentCargoItem>();

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();

    public virtual ICollection<CustomsItem> CustomsItems { get; set; } = new List<CustomsItem>();

    public virtual ICollection<JobCargoDangerousGood> JobCargoDangerousGoods { get; set; } = new List<JobCargoDangerousGood>();

    public virtual ICollection<JobCargoDimension> JobCargoDimensions { get; set; } = new List<JobCargoDimension>();

    public virtual JobHeader? JobCargoJob { get; set; }

    public virtual ICollection<JobKpiresult> JobKpiresults { get; set; } = new List<JobKpiresult>();

    public virtual ICollection<JobRouteCargo> JobRouteCargos { get; set; } = new List<JobRouteCargo>();

    public virtual ICollection<JobTrackingEvent> JobTrackingEvents { get; set; } = new List<JobTrackingEvent>();

    public virtual ICollection<JobTrackingException> JobTrackingExceptions { get; set; } = new List<JobTrackingException>();

    public virtual ICollection<JobTrackingPrediction> JobTrackingPredictions { get; set; } = new List<JobTrackingPrediction>();

    public virtual ICollection<JobTrackingSubscription> JobTrackingSubscriptions { get; set; } = new List<JobTrackingSubscription>();

    public virtual ICollection<T1Item> T1Items { get; set; } = new List<T1Item>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceHsclassification> TceHsclassifications { get; set; } = new List<TceHsclassification>();

    public virtual ICollection<TceLicenseUsage> TceLicenseUsages { get; set; } = new List<TceLicenseUsage>();

    public virtual ICollection<TceOriginDeclaration> TceOriginDeclarations { get; set; } = new List<TceOriginDeclaration>();

    public virtual ICollection<TcePreferenceClaim> TcePreferenceClaims { get; set; } = new List<TcePreferenceClaim>();

    public virtual ICollection<TceScreeningSubject> TceScreeningSubjects { get; set; } = new List<TceScreeningSubject>();

    public virtual ICollection<JobContainer> JobContainers { get; set; } = new List<JobContainer>();
}
