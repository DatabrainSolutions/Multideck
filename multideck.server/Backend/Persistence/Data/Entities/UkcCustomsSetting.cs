using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class UkcCustomsSetting
{
    public Guid UkcId { get; set; }

    public bool UkcSingletonKey { get; set; }

    public string? UkcDefaultEnvironment { get; set; }

    public string UkcDefaultCurrencyCodeSnapshot { get; set; } = null!;

    public string UkcDefaultCountryCodeSnapshot { get; set; } = null!;

    public string UkcDefaultMessageSource { get; set; } = null!;

    public bool UkcRequireValidationBeforeSubmit { get; set; }

    public bool UkcRequireApprovalBeforeSubmit { get; set; }

    public string UkcSettingsJson { get; set; } = null!;

    public DateTime UkcCreatedAt { get; set; }

    public Guid? UkcCreatedBy { get; set; }

    public DateTime UkcUpdatedAt { get; set; }

    public Guid? UkcUpdatedBy { get; set; }

    public virtual SysICustomsEnvironment? UkcDefaultEnvironmentNavigation { get; set; }
}
