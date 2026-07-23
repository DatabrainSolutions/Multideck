using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlTransportMovement
{
    public Guid BlmId { get; set; }

    public Guid BlmBlId { get; set; }

    public string BlmStageCode { get; set; } = null!;

    public int BlmSequence { get; set; }

    public Guid? BlmModeId { get; set; }

    public string? BlmModeCodeSnapshot { get; set; }

    public string? BlmModeNameSnapshot { get; set; }

    public Guid? BlmCarrierOrgId { get; set; }

    public string? BlmCarrierNameSnapshot { get; set; }

    public string? BlmTransportMeansType { get; set; }

    public string? BlmTransportMeansId { get; set; }

    public string? BlmTransportMeansIdscheme { get; set; }

    public string? BlmTransportMeansName { get; set; }

    public string? BlmVoyageNumber { get; set; }

    public Guid? BlmDepartureLocationId { get; set; }

    public string? BlmDepartureLocationSnapshot { get; set; }

    public Guid? BlmArrivalLocationId { get; set; }

    public string? BlmArrivalLocationSnapshot { get; set; }

    public DateTime? BlmEtd { get; set; }

    public DateTime? BlmEta { get; set; }

    public DateTime? BlmAtd { get; set; }

    public DateTime? BlmAta { get; set; }

    public string BlmRawSnapshot { get; set; } = null!;

    public virtual BlHeader BlmBl { get; set; } = null!;

    public virtual SysBltransportStage BlmStageCodeNavigation { get; set; } = null!;
}
