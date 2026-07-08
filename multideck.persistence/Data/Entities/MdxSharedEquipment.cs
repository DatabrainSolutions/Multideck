using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxSharedEquipment
{
    public Guid MdxequipId { get; set; }

    public Guid MdxequipSharedJobId { get; set; }

    public Guid? MdxequipRouteId { get; set; }

    public Guid? MdxequipLocalContainerId { get; set; }

    public string? MdxequipRemoteEquipmentId { get; set; }

    public string MdxequipStatusCode { get; set; } = null!;

    public string MdxequipEquipmentKind { get; set; } = null!;

    public string? MdxequipContainerNumber { get; set; }

    public string? MdxequipEquipmentTypeCodeSnapshot { get; set; }

    public Guid? MdxequipOwnerOrgId { get; set; }

    public string? MdxequipOwnerNameSnapshot { get; set; }

    public string MdxequipSealJson { get; set; } = null!;

    public decimal? MdxequipTareKilos { get; set; }

    public decimal? MdxequipGrossKilos { get; set; }

    public decimal? MdxequipVgmkilos { get; set; }

    public decimal? MdxequipReeferSetPoint { get; set; }

    public string? MdxequipReeferUnit { get; set; }

    public string MdxequipMetadataJson { get; set; } = null!;

    public DateTime MdxequipUpdatedAt { get; set; }

    public virtual OrgMaster? MdxequipOwnerOrg { get; set; }

    public virtual MdxSharedRouteLeg? MdxequipRoute { get; set; }

    public virtual MdxSharedJob MdxequipSharedJob { get; set; } = null!;

    public virtual SysMdxrecordStatus MdxequipStatusCodeNavigation { get; set; } = null!;
}
