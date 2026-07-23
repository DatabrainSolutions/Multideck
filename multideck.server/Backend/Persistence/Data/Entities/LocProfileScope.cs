using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class LocProfileScope
{
    public Guid LocprofileScopeId { get; set; }

    public Guid LocprofileId { get; set; }

    public string LocprofileScopeScopeTypeCode { get; set; } = null!;

    public Guid? CompanyId { get; set; }

    public Guid? LocprofileScopeOrgOfficeId { get; set; }

    public Guid? LocprofileScopeLegalEntityId { get; set; }

    public Guid? LocprofileScopeBrandId { get; set; }

    public Guid? LocprofileScopeUserId { get; set; }

    public Guid? LocprofileScopePortalUserId { get; set; }

    public Guid? LocprofileScopeOrgId { get; set; }

    public int LocprofileScopePriority { get; set; }

    public DateOnly? LocprofileScopeEffectiveFrom { get; set; }

    public DateOnly? LocprofileScopeEffectiveTo { get; set; }

    public bool LocprofileScopeIsDefault { get; set; }

    public bool LocprofileScopeIsActive { get; set; }

    public string LocprofileScopeSettingsJson { get; set; } = null!;

    public DateTime LocprofileScopeCreatedAt { get; set; }

    public Guid? LocprofileScopeCreatedBy { get; set; }

    public virtual CmpCompany? Company { get; set; }

    public virtual LocLocalisationProfile Locprofile { get; set; } = null!;

    public virtual CmpBrand? LocprofileScopeBrand { get; set; }

    public virtual CmpUser? LocprofileScopeCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? LocprofileScopeLegalEntity { get; set; }

    public virtual OrgMaster? LocprofileScopeOrg { get; set; }

    public virtual CmpOffice? LocprofileScopeOrgOffice { get; set; }

    public virtual PortalUser? LocprofileScopePortalUser { get; set; }

    public virtual SysLocpreferenceScopeType LocprofileScopeScopeTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? LocprofileScopeUser { get; set; }
}
