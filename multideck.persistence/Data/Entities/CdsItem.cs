using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsItem
{
    public Guid CdsiId { get; set; }

    public Guid CdsiCdsid { get; set; }

    public int CdsiItemNumber { get; set; }

    public string? CdsiCommodityCode { get; set; }

    public string CdsiTaricadditionalCodesJson { get; set; } = null!;

    public string CdsiDescriptionOfGoods { get; set; } = null!;

    public string? CdsiRequestedProcedureCode { get; set; }

    public string? CdsiPreviousProcedureCode { get; set; }

    public string CdsiAdditionalProcedureCodesJson { get; set; } = null!;

    public string? CdsiCountryOfOriginCodeSnapshot { get; set; }

    public string? CdsiCountryOfPreferentialOriginCodeSnapshot { get; set; }

    public string? CdsiCountryOfDispatchCodeSnapshot { get; set; }

    public string? CdsiCountryOfDestinationCodeSnapshot { get; set; }

    public string? CdsiPreferenceCode { get; set; }

    public string? CdsiValuationMethod { get; set; }

    public decimal? CdsiNetMass { get; set; }

    public decimal? CdsiGrossMass { get; set; }

    public decimal? CdsiSupplementaryUnits { get; set; }

    public decimal? CdsiItemPriceAmount { get; set; }

    public string? CdsiItemPriceCurrencyCodeSnapshot { get; set; }

    public decimal? CdsiStatisticalValueAmount { get; set; }

    public string? CdsiStatisticalValueCurrencyCodeSnapshot { get; set; }

    public string? CdsiInvoiceLineReference { get; set; }

    public bool? CdsiContainerIndicator { get; set; }

    public string CdsiItemJson { get; set; } = null!;

    public DateTime CdsiCreatedAt { get; set; }

    public Guid? CdsiJobCargoId { get; set; }

    public virtual ICollection<CdsAdditionalInformation> CdsAdditionalInformations { get; set; } = new List<CdsAdditionalInformation>();

    public virtual ICollection<CdsContainer> CdsContainers { get; set; } = new List<CdsContainer>();

    public virtual ICollection<CdsDataElement> CdsDataElements { get; set; } = new List<CdsDataElement>();

    public virtual ICollection<CdsDocument> CdsDocuments { get; set; } = new List<CdsDocument>();

    public virtual ICollection<CdsPackage> CdsPackages { get; set; } = new List<CdsPackage>();

    public virtual ICollection<CdsParty> CdsParties { get; set; } = new List<CdsParty>();

    public virtual ICollection<CdsTaxis> CdsTaxes { get; set; } = new List<CdsTaxis>();

    public virtual ICollection<CdsValidationResult> CdsValidationResults { get; set; } = new List<CdsValidationResult>();

    public virtual ICollection<CdsValuationAdjustment> CdsValuationAdjustments { get; set; } = new List<CdsValuationAdjustment>();

    public virtual CdsDeclaration CdsiCds { get; set; } = null!;

    public virtual JobCargo? CdsiJobCargo { get; set; }
}
