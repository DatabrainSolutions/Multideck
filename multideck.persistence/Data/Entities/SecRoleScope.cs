using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecRoleScope
{
    public Guid SecroleScopeId { get; set; }

    public Guid SecroleScopeRoleId { get; set; }

    public string SecroleScopeScopeTypeCode { get; set; } = null!;

    public Guid? SecroleScopeOrgOfficeId { get; set; }

    public Guid? SecroleScopeLegalEntityId { get; set; }

    public Guid? SecroleScopeBrandId { get; set; }

    public Guid? SecroleScopeOrganisationId { get; set; }

    public string? SecroleScopeCountryCode { get; set; }

    public string? SecroleScopeModuleCode { get; set; }

    public string SecroleScopeStatusCode { get; set; } = null!;

    public string SecroleScopeConditionsJson { get; set; } = null!;

    public DateTime SecroleScopeCreatedAt { get; set; }

    public virtual CmpBrand? SecroleScopeBrand { get; set; }

    public virtual CmpLegalEntity? SecroleScopeLegalEntity { get; set; }

    public virtual SysSubmoduleCode? SecroleScopeModuleCodeNavigation { get; set; }

    public virtual CmpOffice? SecroleScopeOrgOffice { get; set; }

    public virtual OrgMaster? SecroleScopeOrganisation { get; set; }

    public virtual SecRole SecroleScopeRole { get; set; } = null!;

    public virtual SysSecscopeType SecroleScopeScopeTypeCodeNavigation { get; set; } = null!;

    public virtual SysSecgrantStatus SecroleScopeStatusCodeNavigation { get; set; } = null!;
}
