using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecApiclientScope
{
    public Guid SecapiScopeId { get; set; }

    public Guid SecapiScopeClientId { get; set; }

    public Guid? SecapiScopePermissionId { get; set; }

    public string? SecapiScopeModuleCode { get; set; }

    public string SecapiScopeScopeTypeCode { get; set; } = null!;

    public Guid? SecapiScopeOrgOfficeId { get; set; }

    public string SecapiScopeStatusCode { get; set; } = null!;

    public string SecapiScopeConditionsJson { get; set; } = null!;

    public virtual SecApiclient SecapiScopeClient { get; set; } = null!;

    public virtual SysSubmoduleCode? SecapiScopeModuleCodeNavigation { get; set; }

    public virtual CmpOffice? SecapiScopeOrgOffice { get; set; }

    public virtual SecPermission? SecapiScopePermission { get; set; }

    public virtual SysSecscopeType SecapiScopeScopeTypeCodeNavigation { get; set; } = null!;

    public virtual SysSecgrantStatus SecapiScopeStatusCodeNavigation { get; set; } = null!;
}
