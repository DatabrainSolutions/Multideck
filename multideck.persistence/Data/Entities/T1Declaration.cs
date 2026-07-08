using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1Declaration
{
    public Guid T1Id { get; set; }

    public Guid? T1CustomsId { get; set; }

    public Guid? T1JobId { get; set; }

    public Guid? T1OrgOfficeId { get; set; }

    public string? T1OfficeCodeSnapshot { get; set; }

    public string? T1OfficeNameSnapshot { get; set; }

    public string T1DeclarationType { get; set; } = null!;

    public string T1Status { get; set; } = null!;

    public string? T1Lrn { get; set; }

    public string? T1Mrn { get; set; }

    public Guid? T1HolderTransitProcedureOrgId { get; set; }

    public string? T1HolderTransitProcedureEorisnapshot { get; set; }

    public Guid? T1RepresentativeOrgId { get; set; }

    public string? T1RepresentativeEorisnapshot { get; set; }

    public string? T1DepartureOfficeCode { get; set; }

    public string? T1DestinationOfficeCode { get; set; }

    public string T1TransitOfficesJson { get; set; } = null!;

    public string? T1CountryOfDispatchCodeSnapshot { get; set; }

    public string? T1CountryOfDestinationCodeSnapshot { get; set; }

    public DateOnly? T1LimitDate { get; set; }

    public decimal? T1GrossMass { get; set; }

    public int? T1TotalPackages { get; set; }

    public string T1SealNumbersJson { get; set; } = null!;

    public string? T1ICustomsExternalId { get; set; }

    public string? T1ICustomsStatusSnapshot { get; set; }

    public string T1PayloadJson { get; set; } = null!;

    public string T1SourceSnapshot { get; set; } = null!;

    public string? T1InternalNotes { get; set; }

    public DateTime T1CreatedAt { get; set; }

    public Guid? T1CreatedBy { get; set; }

    public DateTime T1UpdatedAt { get; set; }

    public Guid? T1UpdatedBy { get; set; }

    public bool T1IsDeleted { get; set; }

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<IcusSubmission> IcusSubmissions { get; set; } = new List<IcusSubmission>();

    public virtual ICollection<T1Attachment> T1Attachments { get; set; } = new List<T1Attachment>();

    public virtual ICollection<T1AuditLog> T1AuditLogs { get; set; } = new List<T1AuditLog>();

    public virtual ICollection<T1Consignment> T1Consignments { get; set; } = new List<T1Consignment>();

    public virtual CustomsDeclaration? T1Customs { get; set; }

    public virtual ICollection<T1DataElement> T1DataElements { get; set; } = new List<T1DataElement>();

    public virtual SysT1declarationType T1DeclarationTypeNavigation { get; set; } = null!;

    public virtual ICollection<T1Document> T1Documents { get; set; } = new List<T1Document>();

    public virtual ICollection<T1Guarantee> T1Guarantees { get; set; } = new List<T1Guarantee>();

    public virtual ICollection<T1Item> T1Items { get; set; } = new List<T1Item>();

    public virtual JobHeader? T1Job { get; set; }

    public virtual ICollection<T1Party> T1Parties { get; set; } = new List<T1Party>();

    public virtual ICollection<T1RouteCountry> T1RouteCountries { get; set; } = new List<T1RouteCountry>();

    public virtual ICollection<T1Seal> T1Seals { get; set; } = new List<T1Seal>();

    public virtual ICollection<T1StatusHistory> T1StatusHistories { get; set; } = new List<T1StatusHistory>();

    public virtual SysCustomsDeclarationStatus T1StatusNavigation { get; set; } = null!;

    public virtual ICollection<T1Transport> T1Transports { get; set; } = new List<T1Transport>();

    public virtual ICollection<T1ValidationResult> T1ValidationResults { get; set; } = new List<T1ValidationResult>();

    public virtual ICollection<T1Version> T1Versions { get; set; } = new List<T1Version>();
}
