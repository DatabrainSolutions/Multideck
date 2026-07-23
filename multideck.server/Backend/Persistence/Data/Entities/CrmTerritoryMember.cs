using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmTerritoryMember
{
    public Guid CrmterritoryMemberId { get; set; }

    public Guid CrmterritoryMemberTerritoryId { get; set; }

    public Guid CrmterritoryMemberUserId { get; set; }

    public string CrmterritoryMemberRole { get; set; } = null!;

    public bool CrmterritoryMemberIsPrimary { get; set; }

    public bool CrmterritoryMemberIsActive { get; set; }

    public DateTime CrmterritoryMemberCreatedAt { get; set; }

    public virtual CrmTerritory CrmterritoryMemberTerritory { get; set; } = null!;

    public virtual CmpUser CrmterritoryMemberUser { get; set; } = null!;
}
