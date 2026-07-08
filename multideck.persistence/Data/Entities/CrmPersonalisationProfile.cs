using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmPersonalisationProfile
{
    public Guid CrmpersProfileId { get; set; }

    public string CrmpersProfileScopeType { get; set; } = null!;

    public Guid? CrmpersProfileUserId { get; set; }

    public Guid? CrmpersProfileCustomerOrgId { get; set; }

    public Guid? CrmpersProfileOrgOfficeId { get; set; }

    public Guid? CrmpersProfileBrandId { get; set; }

    public string? CrmpersProfileTone { get; set; }

    public string? CrmpersProfileSignoff { get; set; }

    public string CrmpersProfilePreferredChannelsJson { get; set; } = null!;

    public string CrmpersProfileAvoidPhrasesJson { get; set; } = null!;

    public string? CrmpersProfileStyleNotes { get; set; }

    public bool CrmpersProfileIsActive { get; set; }

    public DateTime CrmpersProfileCreatedAt { get; set; }

    public Guid? CrmpersProfileCreatedBy { get; set; }

    public virtual CmpBrand? CrmpersProfileBrand { get; set; }

    public virtual CmpUser? CrmpersProfileCreatedByNavigation { get; set; }

    public virtual OrgMaster? CrmpersProfileCustomerOrg { get; set; }

    public virtual CmpOffice? CrmpersProfileOrgOffice { get; set; }

    public virtual CmpUser? CrmpersProfileUser { get; set; }
}
