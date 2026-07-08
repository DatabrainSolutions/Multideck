using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmTerritory
{
    public Guid CrmterritoryId { get; set; }

    public string CrmterritoryCode { get; set; } = null!;

    public string CrmterritoryName { get; set; } = null!;

    public Guid? CrmterritoryOrgOfficeId { get; set; }

    public Guid? CrmterritoryLegalEntityId { get; set; }

    public Guid? CrmterritoryBrandId { get; set; }

    public string? CrmterritoryCountryCode { get; set; }

    public string? CrmterritoryRegion { get; set; }

    public string? CrmterritoryModeCode { get; set; }

    public string? CrmterritoryTradeLane { get; set; }

    public string? CrmterritoryVertical { get; set; }

    public bool CrmterritoryIsActive { get; set; }

    public string CrmterritoryMetadataJson { get; set; } = null!;

    public DateTime CrmterritoryCreatedAt { get; set; }

    public Guid? CrmterritoryCreatedBy { get; set; }

    public DateTime CrmterritoryUpdatedAt { get; set; }

    public Guid? CrmterritoryUpdatedBy { get; set; }

    public virtual ICollection<CrmAccountProfile> CrmAccountProfiles { get; set; } = new List<CrmAccountProfile>();

    public virtual ICollection<CrmTerritoryMember> CrmTerritoryMembers { get; set; } = new List<CrmTerritoryMember>();

    public virtual CmpBrand? CrmterritoryBrand { get; set; }

    public virtual CmpUser? CrmterritoryCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? CrmterritoryLegalEntity { get; set; }

    public virtual CmpOffice? CrmterritoryOrgOffice { get; set; }

    public virtual CmpUser? CrmterritoryUpdatedByNavigation { get; set; }
}
