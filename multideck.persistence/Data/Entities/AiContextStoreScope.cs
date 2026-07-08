using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiContextStoreScope
{
    public Guid AicssId { get; set; }

    public Guid AicssContextStoreId { get; set; }

    public string AicssScopeType { get; set; } = null!;

    public Guid? AicssCompanyId { get; set; }

    public Guid? AicssOrgOfficeId { get; set; }

    public Guid? AicssLegalEntityId { get; set; }

    public Guid? AicssBrandId { get; set; }

    public Guid? AicssUserRoleId { get; set; }

    public Guid? AicssUserId { get; set; }

    public bool AicssAppliesToChildren { get; set; }

    public int AicssPriority { get; set; }

    public bool AicssIsActive { get; set; }

    public DateTime AicssCreatedAt { get; set; }

    public virtual CmpBrand? AicssBrand { get; set; }

    public virtual CmpCompany? AicssCompany { get; set; }

    public virtual AiContextStore AicssContextStore { get; set; } = null!;

    public virtual CmpLegalEntity? AicssLegalEntity { get; set; }

    public virtual CmpOffice? AicssOrgOffice { get; set; }

    public virtual SysAicontextScopeType AicssScopeTypeNavigation { get; set; } = null!;

    public virtual CmpUser? AicssUser { get; set; }

    public virtual SysUserRole? AicssUserRole { get; set; }
}
