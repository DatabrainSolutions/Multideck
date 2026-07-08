using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateLane
{
    public Guid RatelaneId { get; set; }

    public string RatelaneCode { get; set; } = null!;

    public string RatelaneName { get; set; } = null!;

    public string? RatelaneModeCode { get; set; }

    public string RatelaneDirectionCode { get; set; } = null!;

    public Guid? RatelaneOriginZoneGroupId { get; set; }

    public Guid? RatelaneDestinationZoneGroupId { get; set; }

    public string? RatelaneOriginUnlocode { get; set; }

    public string? RatelaneOriginNameSnapshot { get; set; }

    public string? RatelaneDestinationUnlocode { get; set; }

    public string? RatelaneDestinationNameSnapshot { get; set; }

    public string? RatelaneOriginCountryCode { get; set; }

    public string? RatelaneDestinationCountryCode { get; set; }

    public string? RatelaneViaUnlocode { get; set; }

    public bool RatelaneIsActive { get; set; }

    public DateTime RatelaneCreatedAt { get; set; }

    public Guid? RatelaneCreatedBy { get; set; }

    public virtual ICollection<RateRateSheet> RateRateSheets { get; set; } = new List<RateRateSheet>();

    public virtual ICollection<RateSpotQuote> RateSpotQuotes { get; set; } = new List<RateSpotQuote>();

    public virtual ICollection<RateTariffAssignment> RateTariffAssignments { get; set; } = new List<RateTariffAssignment>();

    public virtual CmpUser? RatelaneCreatedByNavigation { get; set; }

    public virtual RateZoneGroup? RatelaneDestinationZoneGroup { get; set; }

    public virtual SysRateDirection RatelaneDirectionCodeNavigation { get; set; } = null!;

    public virtual SysJobTransportMode? RatelaneModeCodeNavigation { get; set; }

    public virtual RateZoneGroup? RatelaneOriginZoneGroup { get; set; }
}
