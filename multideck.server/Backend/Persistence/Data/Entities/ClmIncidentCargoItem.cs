using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmIncidentCargoItem
{
    public Guid ClmincCargoId { get; set; }

    public Guid ClmincCargoIncidentId { get; set; }

    public Guid? ClmincCargoJobCargoId { get; set; }

    public Guid? ClmincCargoJobContainerId { get; set; }

    public int ClmincCargoLineNo { get; set; }

    public string? ClmincCargoMarksAndNumbers { get; set; }

    public string? ClmincCargoCommodityDescription { get; set; }

    public decimal? ClmincCargoPackagesAffected { get; set; }

    public decimal? ClmincCargoPackagesTotal { get; set; }

    public decimal? ClmincCargoGrossWeightAffectedKg { get; set; }

    public decimal ClmincCargoValueAffectedAmount { get; set; }

    public string ClmincCargoCurrencyCodeSnapshot { get; set; } = null!;

    public decimal? ClmincCargoTemperatureExpected { get; set; }

    public decimal? ClmincCargoTemperatureActual { get; set; }

    public string? ClmincCargoDamageDescription { get; set; }

    public string? ClmincCargoSalvageAction { get; set; }

    public DateTime ClmincCargoCreatedAt { get; set; }

    public virtual ICollection<ClmClaimLine> ClmClaimLines { get; set; } = new List<ClmClaimLine>();

    public virtual ClmIncident ClmincCargoIncident { get; set; } = null!;

    public virtual JobCargo? ClmincCargoJobCargo { get; set; }

    public virtual JobContainer? ClmincCargoJobContainer { get; set; }
}
