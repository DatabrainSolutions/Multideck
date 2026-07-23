using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class UkcOfficeCustomsSetting
{
    public Guid UkcosId { get; set; }

    public Guid UkcosOrgOfficeId { get; set; }

    public string? UkcosOfficeCodeSnapshot { get; set; }

    public string? UkcosOfficeNameSnapshot { get; set; }

    public string? UkcosDefaultBadgeId { get; set; }

    public string? UkcosDefaultEorinumberSnapshot { get; set; }

    public string? UkcosDefaultDeclarationOfficeCode { get; set; }

    public string? UkcosDefaultGoodsLocationCode { get; set; }

    public string? UkcosDefaultCountryCodeSnapshot { get; set; }

    public string? UkcosDefaultCurrencyCodeSnapshot { get; set; }

    public Guid? UkcosDefaultApiConnectionId { get; set; }

    public string UkcosSettingsJson { get; set; } = null!;

    public bool UkcosIsActive { get; set; }

    public DateTime UkcosCreatedAt { get; set; }

    public Guid? UkcosCreatedBy { get; set; }

    public DateTime UkcosUpdatedAt { get; set; }

    public Guid? UkcosUpdatedBy { get; set; }
}
