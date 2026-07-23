using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxSharedRouteLeg
{
    public Guid MdxrouteId { get; set; }

    public Guid MdxrouteSharedJobId { get; set; }

    public Guid? MdxrouteLocalRouteId { get; set; }

    public string? MdxrouteRemoteRouteId { get; set; }

    public string MdxrouteStatusCode { get; set; } = null!;

    public int MdxrouteSequence { get; set; }

    public string? MdxrouteModeCode { get; set; }

    public string? MdxrouteLegTypeCode { get; set; }

    public string? MdxrouteOriginUnlocode { get; set; }

    public string? MdxrouteOriginNameSnapshot { get; set; }

    public string? MdxrouteDestinationUnlocode { get; set; }

    public string? MdxrouteDestinationNameSnapshot { get; set; }

    public Guid? MdxrouteCarrierOrgId { get; set; }

    public string? MdxrouteCarrierNameSnapshot { get; set; }

    public string? MdxrouteVesselName { get; set; }

    public string? MdxrouteVesselImo { get; set; }

    public string? MdxrouteVoyageNumber { get; set; }

    public string? MdxrouteFlightNumber { get; set; }

    public string? MdxrouteVehicleRegistration { get; set; }

    public string? MdxrouteTrailerNumber { get; set; }

    public DateTime? MdxrouteEtd { get; set; }

    public DateTime? MdxrouteEta { get; set; }

    public DateTime? MdxrouteAtd { get; set; }

    public DateTime? MdxrouteAta { get; set; }

    public string? MdxrouteSource { get; set; }

    public string MdxrouteMetadataJson { get; set; } = null!;

    public DateTime MdxrouteUpdatedAt { get; set; }

    public virtual ICollection<MdxSharedEquipment> MdxSharedEquipments { get; set; } = new List<MdxSharedEquipment>();

    public virtual ICollection<MdxSharedMilestone> MdxSharedMilestones { get; set; } = new List<MdxSharedMilestone>();

    public virtual ICollection<MdxSharedTrackingEvent> MdxSharedTrackingEvents { get; set; } = new List<MdxSharedTrackingEvent>();

    public virtual OrgMaster? MdxrouteCarrierOrg { get; set; }

    public virtual MdxSharedJob MdxrouteSharedJob { get; set; } = null!;

    public virtual SysMdxrecordStatus MdxrouteStatusCodeNavigation { get; set; } = null!;
}
